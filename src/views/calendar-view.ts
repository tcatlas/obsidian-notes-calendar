import { WorkspaceLeaf, ItemView, TFile } from 'obsidian';
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
		this.registerEvent(this.app.vault.on('modify', () => this.refresh()));
		this.registerDomEvent(document, 'click', (event) => {
			if (!this.activeHeaderSelector || !this.monthDisplayContainer) return;
			if (!this.monthDisplayContainer.contains(event.target as Node)) {
				this.closeHeaderSelector();
			}
		});
	}

	async onClose(): Promise<void> {
		// Nothing to clean up — registerEvent handles detaching listeners
	}

	// Called by the plugin when settings change
	public refresh(): void {
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
		
		const prevButton = header.createEl('button', { text: '←' });
		prevButton.addClass('calendar-nav-button');
		prevButton.onclick = () => this.previousMonth();

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

		const nextButton = header.createEl('button', { text: '→' });
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
		this.calendarContainer.style.gridTemplateColumns = showWeekNumbers
			? 'auto repeat(7, 1fr)'
			: 'repeat(7, 1fr)';

		// Add day labels
		if (showWeekNumbers) {
			const weekLabel = this.calendarContainer.createDiv('calendar-week-label');
			weekLabel.setText(this.getQuarterLabel(this.currentDate));
		}
		const daysOfWeek = this.getDaysOfWeek();
		daysOfWeek.forEach(day => {
			const dayLabel = this.calendarContainer!.createDiv('calendar-day-label');
			dayLabel.setText(day);
		});

		// Get first day of month and number of days
		const year = this.currentDate.getFullYear();
		const month = this.currentDate.getMonth();
		const firstDay = this.getFirstDayOffset(new Date(year, month, 1).getDay());
		const daysInMonth = new Date(year, month + 1, 0).getDate();
		const totalWeeks = Math.ceil((firstDay + daysInMonth) / 7);

		for (let week = 0; week < totalWeeks; week++) {
			const weekStartDate = this.getCalendarRowStartDate(year, month, week, firstDay);
			if (showWeekNumbers) {
				const weekNumberCell = this.calendarContainer.createDiv('calendar-week-number');
				weekNumberCell.addClass('is-clickable');
				const weekNumberValue = weekNumberCell.createDiv('calendar-week-number-value');
				weekNumberCell.createDiv('calendar-week-number-spacer');
				if (this.selectedWeekStart && this.isSameDay(weekStartDate, this.selectedWeekStart)) {
					weekNumberCell.addClass('is-selected');
				}
				weekNumberValue.setText(String(this.getWeekNumberForRow(weekStartDate)));
				weekNumberCell.onclick = () => this.selectWeek(weekStartDate);
			}

			for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
				const day = week * 7 + dayIndex - firstDay + 1;
				if (day < 1 || day > daysInMonth) {
					this.calendarContainer.createDiv('calendar-empty-day');
					continue;
				}

				const date = new Date(year, month, day);
				const dayCell = this.calendarContainer.createDiv('calendar-day');

				// Day number label
				const dayNumber = dayCell.createDiv('calendar-day-number');
				dayNumber.setText(day.toString());

				// Dash indicators — always render the row to keep all cells the same height
				const noteCount = this.countNotesForDate(date);
				const dashCount = this.getDashCount(noteCount);
				const dashEl = dayCell.createDiv('calendar-day-dashes');
				if (this.plugin.settings.showDashes && dashCount > 0) {
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
		this.getMonthNames().forEach((month, index) => {
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
				this.app.workspace.getLeaf(false).openFile(note);
			};

			// Creation time
			if (this.plugin.settings.showTime) {
				const createdTime = new Date(note.stat.ctime);
				const timeEl = noteItem.createDiv('calendar-note-time');
				timeEl.setText(formatDateTime(createdTime, this.plugin.settings.timeIsoDisplay));
			}

			// Note name link
			const noteLink = noteItem.createEl('a', { cls: 'calendar-note-name' });
			noteLink.href = '#';
			noteLink.setText(note.basename || note.name);
			noteLink.onclick = (e) => {
				e.preventDefault();
				e.stopPropagation();
				this.app.workspace.getLeaf(false).openFile(note);
			};

			// Excerpt — read async and populate when ready
			if (this.plugin.settings.showExcerpt) {
				const excerptEl = noteItem.createDiv('calendar-note-excerpt');
				excerptEl.style.setProperty('line-clamp', String(this.plugin.settings.excerptLines));
				excerptEl.style.setProperty('-webkit-line-clamp', String(this.plugin.settings.excerptLines));
				excerptEl.setText('...');
				this.app.vault.cachedRead(note).then(content => {
					const text = content
						.replace(/^---[\s\S]*?---\n?/, '')  // strip frontmatter
						.replace(/#+\s+.*/g, '')             // strip headings
						.replace(/[[\]*_`]/g, '')             // strip markdown symbols
						.replace(/\s+/g, ' ')
						.trim();
					excerptEl.setText(text || '—');
				}).catch(() => excerptEl.setText('—'));
			}
		});
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

	private countNotesForDate(date: Date): number {
		return this.app.vault.getMarkdownFiles().filter(file =>
			this.isNoteCreatedOnDate(file, date)
		).length;
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
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		const year = date.getFullYear();
		return `${year}-${month}-${day}`;
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
