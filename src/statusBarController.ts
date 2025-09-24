import type { ConfigurationChangeEvent, StatusBarItem } from 'vscode';
import { Disposable, StatusBarAlignment, window } from 'vscode';
import { ToggleMode } from './config';
import type { Commands, CoreConfiguration } from './constants';
import { extensionPrefix } from './constants';
import type { Container } from './container';
import { configuration } from './system/configuration';

export class StatusBarController implements Disposable {
	private readonly _disposable: Disposable;
	private _statusBarItem: StatusBarItem | undefined;

	constructor(private readonly container: Container) {
		this._disposable = Disposable.from(
			configuration.onDidChangeAny(this.onAnyConfigurationChanged, this),
			container.filesExclude.onDidToggle(this._onExcludeToggled, this),
		);

		this.onAnyConfigurationChanged();
	}

	dispose() {
		this._statusBarItem?.dispose();
		this._disposable?.dispose();
	}

	private onAnyConfigurationChanged(e?: ConfigurationChangeEvent) {
		if (
			e == null ||
			configuration.changed(e, 'statusBar.enabled') ||
			configuration.changed(e, 'mode') ||
			configuration.changedAny<CoreConfiguration>(e, 'files.exclude') ||
			configuration.changedAny<CoreConfiguration>(e, 'explorer.excludeGitIgnore')
		) {
			this._statusBarItem?.dispose();

			const { canToggle } = this.container.filesExclude;
			if (configuration.get('statusBar.enabled') && canToggle) {
				this._statusBarItem = window.createStatusBarItem(StatusBarAlignment.Right, 0);
				this._statusBarItem.command = `${extensionPrefix}.toggle` satisfies keyof Commands;
				this.updateStatusBarItem(this.container.filesExclude.toggled);
				this._statusBarItem.show();
			}
		}
	}

	private updateStatusBarItem(toggled: boolean) {
		if (this._statusBarItem == null) return;

		const mode = configuration.get('mode') ?? ToggleMode.Files;

		this._statusBarItem.text = toggled ? '$(eye-closed)' : '$(eye)';

		// Update tooltip based on mode
		let tooltip: string;
		if (mode === ToggleMode.Files) {
			tooltip = `${toggled ? 'Hide' : 'Show'} Files Excluded by files.exclude`;
		} else if (mode === ToggleMode.GitIgnore) {
			tooltip = `${toggled ? 'Hide' : 'Show'} Files Excluded by .gitignore`;
		} else {
			// Both
			tooltip = `${toggled ? 'Hide' : 'Show'} Files Excluded by Both`;
		}

		this._statusBarItem.tooltip = tooltip;
	}

	private _onExcludeToggled() {
		if (this._statusBarItem == null) return;

		this.updateStatusBarItem(this.container.filesExclude.toggled);
	}
}
