import { Plugin, WorkspaceLeaf } from 'obsidian';
import { CalendarView, VIEW_TYPE_CALENDAR } from './views/calendar-view';
import {
	CalendarPluginSettings,
	CalendarSettingTab,
	DEFAULT_SETTINGS,
	normalizeExcerptLines,
	normalizeNoteSortBy,
	normalizeSortOrder,
	normalizeWeekNumberDisplay,
	normalizeTimeDisplayFormat,
} from './settings';

export default class CalendarPlugin extends Plugin {
	settings: CalendarPluginSettings;

	async onload(): Promise<void> {
		console.log('Loading Obsidian Calendar Plugin');

		await this.loadSettings();

		// Register the calendar view
		this.registerView(
			VIEW_TYPE_CALENDAR,
			(leaf: WorkspaceLeaf) => new CalendarView(leaf, this)
		);

		// Add settings tab
		this.addSettingTab(new CalendarSettingTab(this.app, this));

		// Add a ribbon icon to open the calendar view
		this.addRibbonIcon('calendar-glyph', 'Open Calendar', async () => {
			await this.activateView();
		});

		// Add a command to open the calendar
		this.addCommand({
			id: 'open-calendar',
			name: 'Open Calendar View',
			callback: async () => {
				await this.activateView();
			}
		});

		// Open the calendar view when the workspace is ready
		this.app.workspace.onLayoutReady(() => {
			this.activateView();
		});
	}

	onunload(): void {
		console.log('Unloading Obsidian Calendar Plugin');
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_CALENDAR);
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		this.settings.timeIsoDisplay = normalizeTimeDisplayFormat(this.settings.timeIsoDisplay ?? '');
		this.settings.excerptLines = normalizeExcerptLines(this.settings.excerptLines ?? DEFAULT_SETTINGS.excerptLines);
		this.settings.noteSortBy = normalizeNoteSortBy(this.settings.noteSortBy ?? '');
		this.settings.noteSortOrder = normalizeSortOrder(this.settings.noteSortOrder ?? '');
		this.settings.weekNumberDisplay = normalizeWeekNumberDisplay(this.settings.weekNumberDisplay ?? '');
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	refreshCalendarView(): void {
		this.app.workspace.getLeavesOfType(VIEW_TYPE_CALENDAR).forEach(leaf => {
			if (leaf.view instanceof CalendarView) {
				leaf.view.refresh();
			}
		});
	}

	async activateView(): Promise<void> {
		try {
			const { workspace } = this.app;

			let leaf: WorkspaceLeaf | null = null;

			// Look for an existing calendar view
			const leaves = workspace.getLeavesOfType(VIEW_TYPE_CALENDAR);
			if (leaves.length > 0) {
				leaf = leaves[0];
			} else {
				// Create a new leaf in the right sidebar
				leaf = workspace.getRightLeaf(false);
				if (leaf) {
					await leaf.setViewState({ type: VIEW_TYPE_CALENDAR, active: true });
				}
			}

			// Reveal the leaf
			if (leaf) {
				workspace.revealLeaf(leaf);
			}
		} catch (error) {
			console.error('Failed to activate calendar view:', error);
		}
	}
}
