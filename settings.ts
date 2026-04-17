import { App, PluginSettingTab, Setting } from 'obsidian';
import type CalendarPlugin from './main';

export type TimeDisplayFormat = string;
export type WeekStartDay = 'monday' | 'sunday';
export type WeekNumberDisplay = 'off' | 'iso-8601' | 'united-states';
export type NoteSortBy = 'name' | 'creation-time';
export type SortOrder = 'ascending' | 'descending';

export interface CalendarPluginSettings {
	showDashes: boolean;
	dashOneThreshold: number;
	dashTwoThreshold: number;
	dashThreeThreshold: number;
	showTime: boolean;
	timeIsoDisplay: TimeDisplayFormat;
	showExcerpt: boolean;
	excerptLines: number;
	noteSortBy: NoteSortBy;
	noteSortOrder: SortOrder;
	weekStartDay: WeekStartDay;
	weekNumberDisplay: WeekNumberDisplay;
}

export const DEFAULT_SETTINGS: CalendarPluginSettings = {
	showDashes: true,
	dashOneThreshold: 1,
	dashTwoThreshold: 3,
	dashThreeThreshold: 5,
	showTime: true,
	timeIsoDisplay: 'HH:mm:ss',
	showExcerpt: true,
	excerptLines: 2,
	noteSortBy: 'creation-time',
	noteSortOrder: 'ascending',
	weekStartDay: 'sunday',
	weekNumberDisplay: 'off',
};

export function normalizeTimeDisplayFormat(value: string): TimeDisplayFormat {
	const trimmed = value.trim();
	if (!trimmed) {
		return DEFAULT_SETTINGS.timeIsoDisplay;
	}
	return trimmed;
}

export function normalizeWeekNumberDisplay(value: string): WeekNumberDisplay {
	if (value === 'iso-8601' || value === 'international') {
		return 'iso-8601';
	}
	if (value === 'united-states') {
		return 'united-states';
	}
	return 'off';
}

export function normalizeExcerptLines(value: number): number {
	if (value < 1) return 1;
	if (value > 3) return 3;
	return Math.round(value);
}

export function normalizeNoteSortBy(value: string): NoteSortBy {
	return value === 'creation-time' ? 'creation-time' : 'name';
}

export function normalizeSortOrder(value: string): SortOrder {
	return value === 'descending' ? 'descending' : 'ascending';
}

export function formatDateTime(date: Date, format: TimeDisplayFormat): string {

	const padNumber = (value: number, width: number): string => {
		const zeros = width === 3 ? '000' : '00';
		return (zeros + String(value)).slice(-width);
	};

	const year = date.getFullYear();
	const month = date.getMonth() + 1;
	const day = date.getDate();
	const hour24 = date.getHours();
	const hour12 = hour24 % 12 || 12;
	const minute = date.getMinutes();
	const second = date.getSeconds();
	const millisecond = date.getMilliseconds();
	const meridiem = hour24 >= 12 ? 'PM' : 'AM';

	const replacements: Record<string, string> = {
		'YYYY': String(year),
		'YY': String(year).slice(-2),
		'MM': padNumber(month, 2),
		'M': String(month),
		'DD': padNumber(day, 2),
		'D': String(day),
		'HH': padNumber(hour24, 2),
		'H': String(hour24),
		'hh': padNumber(hour12, 2),
		'h': String(hour12),
		'mm': padNumber(minute, 2),
		'm': String(minute),
		'ss': padNumber(second, 2),
		's': String(second),
		'SSS': padNumber(millisecond, 3),
		'aa': meridiem,
		'a': meridiem.toLowerCase(),
	};

	const tokenPattern = /(YYYY|YY|SSS|MM|M|DD|D|HH|H|hh|h|mm|m|ss|s|aa|a)/g;
	return format.replace(tokenPattern, (token) => replacements[token] ?? token);
}

export class CalendarSettingTab extends PluginSettingTab {
	plugin: CalendarPlugin;

	constructor(app: App, plugin: CalendarPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Notes Calendar Settings' });

		// --- Note List section ---
		containerEl.createEl('h3', { text: 'Note List' });

		new Setting(containerEl)
			.setName('Show creation time')
			.setDesc('Display note creation time.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showTime)
				.onChange(async (value) => {
					this.plugin.settings.showTime = value;
					await this.plugin.saveSettings();
					this.plugin.refreshCalendarView();
					timeFormatSetting.settingEl.style.display = value ? '' : 'none';
				})
			);

		const timeFormatSetting = new Setting(containerEl)
			.setName('Time display format')
			.setDesc(this.buildTimeFormatDesc(this.plugin.settings.timeIsoDisplay))
			.addText(text => text
				.setPlaceholder('HH:mm:ss')
				.setValue(this.plugin.settings.timeIsoDisplay)
				.onChange(async (value) => {
					this.plugin.settings.timeIsoDisplay = normalizeTimeDisplayFormat(value);
					await this.plugin.saveSettings();
					this.plugin.refreshCalendarView();
					timeFormatSetting.setDesc(this.buildTimeFormatDesc(this.plugin.settings.timeIsoDisplay));
				})
			);
		timeFormatSetting.settingEl.style.display = this.plugin.settings.showTime ? '' : 'none';

		new Setting(containerEl)
			.setName('Sort notes by')
			.setDesc('Choose how notes are sorted in the note list.')
			.addDropdown(dropdown => dropdown
				.addOption('name', 'Name')
				.addOption('creation-time', 'Creation date/time')
				.setValue(this.plugin.settings.noteSortBy)
				.onChange(async (value) => {
					this.plugin.settings.noteSortBy = normalizeNoteSortBy(value);
					await this.plugin.saveSettings();
					this.plugin.refreshCalendarView();
				})
			);

		new Setting(containerEl)
			.setName('Sort order')
			.setDesc('Choose whether notes are shown ascending or descending.')
			.addDropdown(dropdown => dropdown
				.addOption('ascending', 'Ascending')
				.addOption('descending', 'Descending')
				.setValue(this.plugin.settings.noteSortOrder)
				.onChange(async (value) => {
					this.plugin.settings.noteSortOrder = normalizeSortOrder(value);
					await this.plugin.saveSettings();
					this.plugin.refreshCalendarView();
				})
			);

		new Setting(containerEl)
			.setName('Show excerpt')
			.setDesc('Display a short preview of each note\'s content.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showExcerpt)
				.onChange(async (value) => {
					this.plugin.settings.showExcerpt = value;
					await this.plugin.saveSettings();
					this.plugin.refreshCalendarView();
					excerptSection.style.display = value ? '' : 'none';
				})
			);

		const excerptSection = containerEl.createDiv();
		excerptSection.style.marginLeft = '24px';
		excerptSection.style.paddingLeft = '12px';
		excerptSection.style.borderLeft = '1px solid var(--background-modifier-border)';

		new Setting(excerptSection)
			.setName('Excerpt lines')
			.setDesc('Specify the maximum number of lines to show in note excerpts.')
			.addDropdown(dropdown => dropdown
				.addOption('1', '1')
				.addOption('2', '2')
				.addOption('3', '3')
				.addOption('4', '4')
				.addOption('5', '5')
				.setValue(String(this.plugin.settings.excerptLines))
				.onChange(async (value) => {
					this.plugin.settings.excerptLines = normalizeExcerptLines(parseInt(value, 10));
					await this.plugin.saveSettings();
					this.plugin.refreshCalendarView();
				})
			);
		excerptSection.style.display = this.plugin.settings.showExcerpt ? '' : 'none';

		// --- Calendar Display section ---
		containerEl.createEl('h3', { text: 'Calendar Display' });

		new Setting(containerEl)
			.setName('Week starts on')
			.setDesc('Choose the first day shown in each week.')
			.addDropdown(dropdown => dropdown
				.addOption('sunday', 'Sunday')
				.addOption('monday', 'Monday')
				.setValue(this.plugin.settings.weekStartDay)
				.onChange(async (value) => {
					this.plugin.settings.weekStartDay = value === 'monday' ? 'monday' : 'sunday';
					await this.plugin.saveSettings();
					this.plugin.refreshCalendarView();
				})
			);

		new Setting(containerEl)
			.setName('Week numbers')
			.setDesc('Display week numbers in the calendar.')
			.addDropdown(dropdown => dropdown
				.addOption('off', 'Off')
				.addOption('iso-8601', 'ISO 8601')
				.addOption('united-states', 'United States')
				.setValue(this.plugin.settings.weekNumberDisplay)
				.onChange(async (value) => {
					this.plugin.settings.weekNumberDisplay = normalizeWeekNumberDisplay(value);
					await this.plugin.saveSettings();
					this.plugin.refreshCalendarView();
				})
			);

		new Setting(containerEl)
			.setName('Show note indicators')
			.setDesc('Display indicators on days that have notes.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showDashes)
				.onChange(async (value) => {
					this.plugin.settings.showDashes = value;
					await this.plugin.saveSettings();
					this.plugin.refreshCalendarView();
					// Show/hide threshold settings based on toggle
					thresholdSection.style.display = value ? '' : 'none';
				})
			);

		const thresholdSection = containerEl.createDiv();
		thresholdSection.style.marginLeft = '24px';
		thresholdSection.style.paddingLeft = '12px';
		thresholdSection.style.borderLeft = '1px solid var(--background-modifier-border)';
		thresholdSection.style.display = this.plugin.settings.showDashes ? '' : 'none';

		thresholdSection.createEl('p', {
			text: 'Set the minimum number of notes required for each indicator level.',
			cls: 'setting-item-description',
		});

		new Setting(thresholdSection)
			.setName('One')
			.addText(text => text
				.setPlaceholder('1')
				.setValue(String(this.plugin.settings.dashOneThreshold))
				.onChange(async (value) => {
					const num = parseInt(value, 10);
					if (!isNaN(num) && num >= 1) {
						this.plugin.settings.dashOneThreshold = num;
						await this.plugin.saveSettings();
						this.plugin.refreshCalendarView();
					}
				})
			);

		new Setting(thresholdSection)
			.setName('Two')
			.addText(text => text
				.setPlaceholder('3')
				.setValue(String(this.plugin.settings.dashTwoThreshold))
				.onChange(async (value) => {
					const num = parseInt(value, 10);
					if (!isNaN(num) && num >= 1) {
						this.plugin.settings.dashTwoThreshold = num;
						await this.plugin.saveSettings();
						this.plugin.refreshCalendarView();
					}
				})
			);

		new Setting(thresholdSection)
			.setName('Three')
			.addText(text => text
				.setPlaceholder('5')
				.setValue(String(this.plugin.settings.dashThreeThreshold))
				.onChange(async (value) => {
					const num = parseInt(value, 10);
					if (!isNaN(num) && num >= 1) {
						this.plugin.settings.dashThreeThreshold = num;
						await this.plugin.saveSettings();
						this.plugin.refreshCalendarView();
					}
				})
			);
	}

	private buildTimeFormatDesc(format: TimeDisplayFormat): string {
		const now = new Date();
		const preview = formatDateTime(now, format);
		return `Example: HH:mm, hh:mm:ss aa, YYYY-MM-DD. Preview: ${preview}`;
	}
}
