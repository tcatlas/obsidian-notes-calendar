import { WorkspaceLeaf, ItemView, TFile, setIcon } from 'obsidian';
import type CalendarPlugin from '../main';
import { formatDateTime } from '../settings';

export const VIEW_TYPE_CALENDAR = 'calendar-view';

export class CalendarView extends ItemView {
	private plugin: CalendarPlugin;
	private currentDate: Date;
	private selectedDate: Date | null = null;
	private selectedWeekStart: Date | null = null;
	private calendarContainer: HTMLElement | null = null;
	private notesContainer: HTMLElement | null = null;
	private monthDisplayContainer: HTMLElement | null = null;
	private monthDisplayButton: HTMLButtonElement | null = null;
	private yearDisplayButton: HTMLButtonElement | null = null;
	private headerSelectorPopover: HTMLElement | null = null;
	private activeHeaderSelector: 'month' | 'year' | null = null;
	private yearSelectorCenter: number;
	private modifyDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	private refreshGeneration = 0;

	constructor(leaf: WorkspaceLeaf, plugin: CalendarPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.currentDate = new Date();
		this.selectedDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), this.currentDate.getDate());
		this.yearSelectorCenter = this.currentDate.getFullYear();
	}

	getViewType(): string {
		return VIEW_TYPE_CALENDAR;
	}

	getDisplayText(): string {
		return 'Calendar';
	}

	getIcon(): string {
		return 'calendar-1';
	}

	async onOpen(): Promise<void> {
		this.createCalendarView();
		// registerEvent automatically detaches listeners when the view is closed
		this.registerEvent(this.app.vault.on('create', () => this.refresh()));
		this.registerEvent(this.app.vault.on('delete', () => this.refresh()));
		this.registerEvent(this.app.vault.on('rename', () => this.refresh()));
		this.registerEvent(this.app.vault.on('modify', () => {
			if (this.modifyDebounceTimer) clearTimeout(this.modifyDebounceTimer);
			this.modifyDebounceTimer = setTimeout(() => this.refresh(), 400);
		}));
		this.registerDomEvent(document, 'click', (event) => {
			if (!this.activeHeaderSelector || !this.monthDisplayContainer) return;
			if (!this.monthDisplayContainer.contains(event.target as Node)) {
				this.closeHeaderSelector();
			}
		});
	}

	async onClose(): Promise<void> {
		if (this.modifyDebounceTimer) clearTimeout(this.modifyDebounceTimer);
	}

	// Called by the plugin when settings change
	public refresh(): void {
		this.refreshGeneration++;
		this.renderHeader();
		this.renderCalendar();
		this.updateNotesList();
		this.renderHeaderSelector();
	}

	private createCalendarView(): void {
		// Use contentEl per Obsidian docs: https://docs.obsidian.md/Plugins/User+interface/Views
		const container = this.contentEl;
		container.empty();

		const mainContainer = container.createDiv('calendar-main-container');
		
		// Create header with month/year and navigation
		const header = mainContainer.createDiv('calendar-header');
		
		const todayButton = header.createEl('button', { attr: { 'aria-label': 'Go to today' } });
		todayButton.addClass('calendar-nav-button', 'calendar-today-button');
		setIcon(todayButton, 'calendar-1');
		todayButton.onclick = () => this.goToToday();

		this.monthDisplayContainer = header.createDiv('calendar-month-display');
		this.monthDisplayButton = this.monthDisplayContainer.createEl('button', { cls: 'calendar-month-display-button' });
		this.monthDisplayButton.type = 'button';
		this.monthDisplayButton.onclick = (event) => {
			event.stopPropagation();
			this.openMonthSelector();
		};

		this.yearDisplayButton = this.monthDisplayContainer.createEl('button', { cls: 'calendar-month-display-button' });
		this.yearDisplayButton.type = 'button';
		this.yearDisplayButton.onclick = (event) => {
			event.stopPropagation();
			this.openYearSelector();
		};
		this.renderHeader();

		const navGroup = header.createDiv('calendar-nav-group');

		const prevButton = navGroup.createEl('button', { text: '←' });
		prevButton.addClass('calendar-nav-button');
		prevButton.onclick = () => this.previousMonth();

		const nextButton = navGroup.createEl('button', { text: '→' });
		nextButton.addClass('calendar-nav-button');
		nextButton.onclick = () => this.nextMonth();

		// Create calendar grid
		this.calendarContainer = mainContainer.createDiv('calendar-grid-container');
		this.renderCalendar();

		// Create notes list container
		this.notesContainer = mainContainer.createDiv('calendar-notes-container');
		this.updateNotesList();
	}

	private renderCalendar() {
		if (!this.calendarContainer) return;

		this.calendarContainer.empty();
		const showWeekNumbers = this.plugin.settings.weekNumberDisplay !== 'off';
		const visibleWeekdays = this.getVisibleWeekdays();
		const visibleWeekdayCount = visibleWeekdays.length;
		this.calendarContainer.style.gridTemplateColumns = showWeekNumbers
			? `auto repeat(${visibleWeekdayCount}, 1fr)`
			: `repeat(${visibleWeekdayCount}, 1fr)`;

		// Add day labels
		if (showWeekNumbers) {
			const weekLabel = this.calendarContainer.createDiv('calendar-week-label');
			weekLabel.setText(this.getQuarterLabel(this.currentDate));
		}
		visibleWeekdays.forEach(({ label }) => {
			const dayLabel = this.calendarContainer!.createDiv('calendar-day-label');
			dayLabel.setText(label);
		});

		// Get first day of month and number of days
		const year = this.currentDate.getFullYear();
		const month = this.currentDate.getMonth();
		const firstDay = this.getFirstDayOffset(new Date(year, month, 1).getDay());
		const daysInMonth = new Date(year, month + 1, 0).getDate();
		const totalWeeks = Math.ceil((firstDay + daysInMonth) / 7);
		const noteCountMap = this.buildNoteCountMap(year, month);

		for (let week = 0; week < totalWeeks; week++) {
			const weekStartDate = this.getCalendarRowStartDate(year, month, week, firstDay);
			if (showWeekNumbers) {
				const weekNumberCell = this.calendarContainer.createDiv('calendar-week-number');
				weekNumberCell.addClass('is-clickable');
				const weekNumberValue = weekNumberCell.createDiv('calendar-week-number-value');
				if (this.plugin.settings.showDashes) {
					weekNumberCell.createDiv('calendar-week-number-spacer');
				}
				if (this.selectedWeekStart && this.isSameDay(weekStartDate, this.selectedWeekStart)) {
					weekNumberCell.addClass('is-selected');
				}
				weekNumberValue.setText(String(this.getWeekNumberForRow(weekStartDate)));
				weekNumberCell.onclick = () => this.selectWeek(weekStartDate);
			}

			for (const weekday of visibleWeekdays) {
				const day = week * 7 + weekday.displayIndex - firstDay + 1;
				if (day < 1 || day > daysInMonth) {
					this.calendarContainer.createDiv('calendar-empty-day');
					continue;
				}

				const date = new Date(year, month, day);
				const dayCell = this.calendarContainer.createDiv('calendar-day');

				// Day number label
				const dayNumber = dayCell.createDiv('calendar-day-number');
				dayNumber.setText(day.toString());

				// Dash indicators
				if (this.plugin.settings.showDashes) {
					const noteCount = noteCountMap.get(day) ?? 0;
					const dashCount = this.getDashCount(noteCount);
					const dashEl = dayCell.createDiv('calendar-day-dashes');
					for (let i = 0; i < dashCount; i++) {
						dashEl.createSpan('calendar-day-dash');
					}
				}

				dayCell.onclick = () => this.selectDate(date);

				if (this.selectedWeekStart && this.isDateInWeek(date, this.selectedWeekStart)) {
					dayCell.addClass('calendar-day-in-selected-week');
				}

				// Check if this day is selected
				if (this.selectedDate && this.isSameDay(date, this.selectedDate)) {
					dayCell.addClass('calendar-day-selected');
				}
			}
		}
	}

	private getFirstDayOffset(day: number): number {
		return this.plugin.settings.weekStartDay === 'monday' ? (day + 6) % 7 : day;
	}

	private getDaysOfWeek(): string[] {
		if (this.plugin.settings.weekStartDay === 'monday') {
			return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
		}
		return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	}

	private getVisibleWeekdays(): Array<{ label: string; absoluteDay: number; displayIndex: number }> {
		const orderedDays = this.getOrderedWeekdays();
		const visibleDays = orderedDays.filter(({ absoluteDay }) => this.isWeekdayVisible(absoluteDay));
		return visibleDays.length > 0 ? visibleDays : orderedDays;
	}

	private getOrderedWeekdays(): Array<{ label: string; absoluteDay: number; displayIndex: number }> {
		if (this.plugin.settings.weekStartDay === 'monday') {
			return [
				{ label: 'Mon', absoluteDay: 1, displayIndex: 0 },
				{ label: 'Tue', absoluteDay: 2, displayIndex: 1 },
				{ label: 'Wed', absoluteDay: 3, displayIndex: 2 },
				{ label: 'Thu', absoluteDay: 4, displayIndex: 3 },
				{ label: 'Fri', absoluteDay: 5, displayIndex: 4 },
				{ label: 'Sat', absoluteDay: 6, displayIndex: 5 },
				{ label: 'Sun', absoluteDay: 0, displayIndex: 6 },
			];
		}

		return [
			{ label: 'Sun', absoluteDay: 0, displayIndex: 0 },
			{ label: 'Mon', absoluteDay: 1, displayIndex: 1 },
			{ label: 'Tue', absoluteDay: 2, displayIndex: 2 },
			{ label: 'Wed', absoluteDay: 3, displayIndex: 3 },
			{ label: 'Thu', absoluteDay: 4, displayIndex: 4 },
			{ label: 'Fri', absoluteDay: 5, displayIndex: 5 },
			{ label: 'Sat', absoluteDay: 6, displayIndex: 6 },
		];
	}

	private isWeekdayVisible(absoluteDay: number): boolean {
		switch (absoluteDay) {
			case 0:
				return this.plugin.settings.showSunday;
			case 1:
				return this.plugin.settings.showMonday;
			case 2:
				return this.plugin.settings.showTuesday;
			case 3:
				return this.plugin.settings.showWednesday;
			case 4:
				return this.plugin.settings.showThursday;
			case 5:
				return this.plugin.settings.showFriday;
			case 6:
				return this.plugin.settings.showSaturday;
			default:
				return true;
		}
	}

	private getWeekNumber(date: Date): number {
		if (this.plugin.settings.weekNumberDisplay === 'iso-8601') {
			return this.getIsoWeekNumber(date);
		}
		return this.getUnitedStatesWeekNumber(date);
	}

	private getWeekNumberForRow(weekStartDate: Date): number {
		return this.getWeekNumber(this.getDisplayedWeekAnchorDate(weekStartDate));
	}

	private getDisplayedWeekAnchorDate(weekStartDate: Date): Date {
		const offset = this.plugin.settings.weekStartDay === 'monday' ? 3 : 4;
		return new Date(
			weekStartDate.getFullYear(),
			weekStartDate.getMonth(),
			weekStartDate.getDate() + offset
		);
	}

	private getIsoWeekNumber(date: Date): number {
		const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
		const dayNumber = utcDate.getUTCDay() || 7;
		utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNumber);
		const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
		return Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
	}

	private getUnitedStatesWeekNumber(date: Date): number {
		const normalized = new Date(date.getFullYear(), date.getMonth(), date.getDate());
		const yearStart = new Date(normalized.getFullYear(), 0, 1);
		const dayOfYear = Math.floor((normalized.getTime() - yearStart.getTime()) / 86400000);
		const jan1Day = yearStart.getDay();
		return Math.floor((dayOfYear + jan1Day) / 7) + 1;
	}

	private selectDate(date: Date) {
		this.selectedDate = date;
		this.selectedWeekStart = null;
		this.renderCalendar();
		this.updateNotesList();
	}

	private selectWeek(weekStartDate: Date) {
		this.selectedWeekStart = new Date(
			weekStartDate.getFullYear(),
			weekStartDate.getMonth(),
			weekStartDate.getDate()
		);
		this.selectedDate = null;
		this.renderCalendar();
		this.updateNotesList();
	}

	private previousMonth() {
		this.closeHeaderSelector();
		this.currentDate = new Date(
			this.currentDate.getFullYear(),
			this.currentDate.getMonth() - 1,
			1
		);
		this.yearSelectorCenter = this.currentDate.getFullYear();
		this.renderHeader();
		this.renderCalendar();
		this.updateNotesList();
	}

	private goToToday() {
		this.closeHeaderSelector();
		const now = new Date();
		this.currentDate = new Date(now.getFullYear(), now.getMonth(), 1);
		this.selectedDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		this.selectedWeekStart = null;
		this.yearSelectorCenter = now.getFullYear();
		this.renderHeader();
		this.renderCalendar();
		this.updateNotesList();
	}

	private nextMonth() {
		this.closeHeaderSelector();
		this.currentDate = new Date(
			this.currentDate.getFullYear(),
			this.currentDate.getMonth() + 1,
			1
		);
		this.yearSelectorCenter = this.currentDate.getFullYear();
		this.renderHeader();
		this.renderCalendar();
		this.updateNotesList();
	}

	private renderHeader() {
		if (!this.monthDisplayButton || !this.yearDisplayButton) return;
		this.monthDisplayButton.setText(this.getMonthName(this.currentDate.getMonth()));
		this.yearDisplayButton.setText(String(this.currentDate.getFullYear()));
	}

	private openMonthSelector() {
		this.activeHeaderSelector = this.activeHeaderSelector === 'month' ? null : 'month';
		this.renderHeaderSelector();
	}

	private openYearSelector() {
		if (this.activeHeaderSelector === 'year') {
			this.closeHeaderSelector();
			return;
		}
		this.yearSelectorCenter = this.currentDate.getFullYear();
		this.activeHeaderSelector = 'year';
		this.renderHeaderSelector();
	}

	private renderHeaderSelector() {
		if (!this.monthDisplayContainer) return;
		if (this.headerSelectorPopover) {
			this.headerSelectorPopover.remove();
			this.headerSelectorPopover = null;
		}
		if (!this.activeHeaderSelector) return;

		const popover = this.monthDisplayContainer.createDiv('calendar-header-popover');
		popover.onclick = (event) => event.stopPropagation();
		this.headerSelectorPopover = popover;

		if (this.activeHeaderSelector === 'month') {
			this.renderMonthSelector(popover);
			return;
		}
		this.renderYearSelector(popover);
	}

	private renderMonthSelector(popover: HTMLElement) {
		const grid = popover.createDiv('calendar-header-selector-grid');
		const shortNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
			'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
		shortNames.forEach((month, index) => {
			const button = grid.createEl('button', {
				cls: 'calendar-header-selector-option',
				text: month,
			});
			button.type = 'button';
			if (index === this.currentDate.getMonth()) {
				button.addClass('is-selected');
			}
			button.onclick = () => {
				this.currentDate = new Date(this.currentDate.getFullYear(), index, 1);
				this.renderHeader();
				this.renderCalendar();
				this.updateNotesList();
				this.closeHeaderSelector();
			};
		});
	}

	private renderYearSelector(popover: HTMLElement) {
		const nav = popover.createDiv('calendar-header-selector-nav');
		const previousButton = nav.createEl('button', {
			cls: 'calendar-header-selector-nav-button',
			text: '←',
		});
		previousButton.type = 'button';
		previousButton.onclick = () => {
			this.yearSelectorCenter -= 9;
			this.renderHeaderSelector();
		};

		const rangeLabel = nav.createDiv('calendar-header-selector-range');
		rangeLabel.setText(`${this.yearSelectorCenter - 4} - ${this.yearSelectorCenter + 4}`);

		const nextButton = nav.createEl('button', {
			cls: 'calendar-header-selector-nav-button',
			text: '→',
		});
		nextButton.type = 'button';
		nextButton.onclick = () => {
			this.yearSelectorCenter += 9;
			this.renderHeaderSelector();
		};

		const grid = popover.createDiv('calendar-header-selector-grid');
		for (let year = this.yearSelectorCenter - 4; year <= this.yearSelectorCenter + 4; year++) {
			const button = grid.createEl('button', {
				cls: 'calendar-header-selector-option',
				text: String(year),
			});
			button.type = 'button';
			if (year === this.currentDate.getFullYear()) {
				button.addClass('is-selected');
			}
			button.onclick = () => {
				this.currentDate = new Date(year, this.currentDate.getMonth(), 1);
				this.renderHeader();
				this.renderCalendar();
				this.updateNotesList();
				this.closeHeaderSelector();
			};
		}
	}

	private closeHeaderSelector() {
		this.activeHeaderSelector = null;
		if (!this.headerSelectorPopover) return;
		this.headerSelectorPopover.remove();
		this.headerSelectorPopover = null;
	}

	private updateNotesList() {
		if (!this.notesContainer || (!this.selectedDate && !this.selectedWeekStart)) {
			if (this.notesContainer) {
				this.notesContainer.empty();
				const emptyMsg = this.notesContainer.createDiv('calendar-notes-empty');
				emptyMsg.setText('Select a date or week to view notes');
			}
			return;
		}

		this.notesContainer.empty();

		const notes = this.selectedWeekStart
			? this.getNotesForWeek(this.selectedWeekStart)
			: this.getNotesForDate(this.selectedDate as Date);

		if (notes.length === 0) {
			const emptyMsg = this.notesContainer.createDiv('calendar-notes-empty');
			emptyMsg.setText(this.selectedWeekStart
				? `No notes for ${this.getWeekLabel(this.selectedWeekStart)}`
				: `No notes for ${this.formatDate(this.selectedDate as Date)}`
			);
			return;
		}

		const notesList = this.notesContainer.createDiv('calendar-notes-list');

		notes.forEach(note => {
			const noteItem = notesList.createDiv('calendar-note-item');
			noteItem.onclick = () => {
				void this.app.workspace.getLeaf(false).openFile(note);
			};

			// Creation time
			if (this.plugin.settings.showTime) {
				const createdTime = new Date(note.stat.ctime);
				const timeEl = noteItem.createDiv('calendar-note-time');
				timeEl.setText(formatDateTime(createdTime, this.plugin.settings.timeIsoDisplay));
			}

			// Note name text (row click opens the note)
			const noteLink = noteItem.createDiv('calendar-note-name');
			noteLink.setText(note.basename || note.name);

			// Excerpt — read async and populate when ready
			if (this.plugin.settings.showExcerpt) {
				const excerptEl = noteItem.createDiv('calendar-note-excerpt');
				excerptEl.addClass(`calendar-note-excerpt-lines-${this.plugin.settings.excerptLines}`);
				excerptEl.setText('...');
				const generation = this.refreshGeneration;
				void this.populateExcerpt(note, excerptEl, generation);
			}
		});
	}

	private async populateExcerpt(note: TFile, excerptEl: HTMLElement, generation: number): Promise<void> {
		try {
			const content = await this.app.vault.cachedRead(note);
			if (this.refreshGeneration !== generation) {
				return;
			}

			excerptEl.setText(this.createExcerptText(content) || '—');
		} catch {
			if (this.refreshGeneration === generation) {
				excerptEl.setText('—');
			}
		}
	}

	private createExcerptText(content: string): string {
		return content
			.replace(/^---[\s\S]*?---\n?/, '')
			.replace(/#+\s+.*/g, '')
			.replace(/[\[\]*_`]/g, '')
			.replace(/\s+/g, ' ')
			.trim();
	}

	private getNotesForDate(date: Date): TFile[] {
		const notes: TFile[] = [];

		// Get all markdown files and filter by creation date
		this.app.vault.getMarkdownFiles().forEach(file => {
			if (this.isNoteCreatedOnDate(file, date)) {
				notes.push(file);
			}
		});

		return this.sortNotes(notes);
	}

	private getNotesForWeek(weekStartDate: Date): TFile[] {
		const notes: TFile[] = [];
		this.app.vault.getMarkdownFiles().forEach(file => {
			if (this.isNoteCreatedInWeek(file, weekStartDate)) {
				notes.push(file);
			}
		});
		return this.sortNotes(notes);
	}

	private sortNotes(notes: TFile[]): TFile[] {
		const direction = this.plugin.settings.noteSortOrder === 'ascending' ? 1 : -1;
		return notes.sort((left, right) => {
			if (this.plugin.settings.noteSortBy === 'creation-time') {
				const timeDifference = left.stat.ctime - right.stat.ctime;
				if (timeDifference !== 0) {
					return timeDifference * direction;
				}
			}

			const nameDifference = left.basename.localeCompare(right.basename);
			if (nameDifference !== 0) {
				return nameDifference * direction;
			}

			return (left.stat.ctime - right.stat.ctime) * direction;
		});
	}

	private buildNoteCountMap(year: number, month: number): Map<number, number> {
		const map = new Map<number, number>();
		this.app.vault.getMarkdownFiles().forEach(file => {
			const fileDate = new Date(file.stat.ctime);
			if (fileDate.getFullYear() === year && fileDate.getMonth() === month) {
				const day = fileDate.getDate();
				map.set(day, (map.get(day) ?? 0) + 1);
			}
		});
		return map;
	}

	private getDashCount(noteCount: number): number {
		const { dashOneThreshold, dashTwoThreshold, dashThreeThreshold } = this.plugin.settings;
		if (noteCount >= dashThreeThreshold) return 3;
		if (noteCount >= dashTwoThreshold) return 2;
		if (noteCount >= dashOneThreshold) return 1;
		return 0;
	}

	private isNoteCreatedOnDate(file: TFile, date: Date): boolean {
		const fileDate = new Date(file.stat.ctime);
		return this.isSameDay(fileDate, date);
	}

	private isNoteCreatedInWeek(file: TFile, weekStartDate: Date): boolean {
		const fileDate = new Date(file.stat.ctime);
		return this.isDateInWeek(fileDate, weekStartDate);
	}

	private isSameDay(date1: Date, date2: Date): boolean {
		return date1.getDate() === date2.getDate() &&
			date1.getMonth() === date2.getMonth() &&
			date1.getFullYear() === date2.getFullYear();
	}

	private formatDate(date: Date): string {
		const pad = (n: number): string => ('0' + String(n)).slice(-2);
		const year = date.getFullYear();
		return `${year}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
	}

	private getQuarterLabel(date: Date): string {
		return `Q${Math.floor(date.getMonth() / 3) + 1}`;
	}

	private getCalendarRowStartDate(year: number, month: number, week: number, firstDayOffset: number): Date {
		return new Date(year, month, week * 7 - firstDayOffset + 1);
	}

	private getWeekEndDate(weekStartDate: Date): Date {
		return new Date(weekStartDate.getFullYear(), weekStartDate.getMonth(), weekStartDate.getDate() + 6);
	}

	private isDateInWeek(date: Date, weekStartDate: Date): boolean {
		const weekEndDate = this.getWeekEndDate(weekStartDate);
		const normalizedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
		const normalizedStart = new Date(weekStartDate.getFullYear(), weekStartDate.getMonth(), weekStartDate.getDate()).getTime();
		const normalizedEnd = new Date(weekEndDate.getFullYear(), weekEndDate.getMonth(), weekEndDate.getDate()).getTime();
		return normalizedDate >= normalizedStart && normalizedDate <= normalizedEnd;
	}

	private getWeekLabel(weekStartDate: Date): string {
		const weekEndDate = this.getWeekEndDate(weekStartDate);
		return `week ${this.getWeekNumberForRow(weekStartDate)} (${this.formatDate(weekStartDate)} to ${this.formatDate(weekEndDate)})`;
	}

	private getMonthName(month: number): string {
		return this.getMonthNames()[month] ?? '';
	}

	private getMonthNames(): string[] {
		return ['January', 'February', 'March', 'April', 'May', 'June',
			'July', 'August', 'September', 'October', 'November', 'December'];
	}
}
