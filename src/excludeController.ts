import type { ConfigurationChangeEvent, Disposable, Event } from 'vscode';
import { ConfigurationTarget, EventEmitter } from 'vscode';
import type { CoreConfiguration, StoredFilesExcludes } from './constants';
import { ToggleMode } from './config';
import type { Container } from './container';
import { configuration } from './system/configuration';
import { setContext } from './system/context';
import { Logger } from './system/logger';
import { areEqual } from './system/object';
import type { Storage } from './system/storage';

export type FilesExcludeConfiguration = Record<string, boolean>;

export class FilesExcludeController implements Disposable {
	private readonly _onDidToggle = new EventEmitter<void>();
	get onDidToggle(): Event<void> {
		return this._onDidToggle.event;
	}

	private readonly _disposable: Disposable;
	private _working: boolean = false;

	constructor(
		private readonly container: Container,
		private readonly storage: Storage,
	) {
		this._disposable = configuration.onDidChangeAny(this.onAnyConfigurationChanged, this);
		this.onAnyConfigurationChanged();
	}

	dispose() {
		this._disposable.dispose();
	}

	private onAnyConfigurationChanged(e?: ConfigurationChangeEvent) {
		if (this._working) return;
		if (
			e != null &&
			!configuration.changedAny<CoreConfiguration>(e, 'files.exclude') &&
			!configuration.changedAny<CoreConfiguration>(e, 'explorer.excludeGitIgnore')
		)
			return;

		const mode = this.getCurrentMode();

		if (mode === ToggleMode.Files || mode === ToggleMode.Both) {
			const savedExclude = this.getSavedExcludeConfiguration();
			if (savedExclude != null) {
				Logger.log('FilesExcludeController.onOtherConfigurationChanged()');

				const newExclude = this.getExcludeConfiguration();
				if (
					newExclude != null &&
					areEqual(savedExclude.globalValue, newExclude.globalValue) &&
					areEqual(savedExclude.workspaceValue, newExclude.workspaceValue)
				) {
					return;
				}

				const appliedExclude = this.getAppliedExcludeConfiguration();
				if (
					newExclude != null &&
					appliedExclude != null &&
					areEqual(appliedExclude.globalValue, newExclude.globalValue) &&
					areEqual(appliedExclude.workspaceValue, newExclude.workspaceValue)
				) {
					return;
				}

				Logger.log('FilesExcludeController.onOtherConfigurationChanged()', 'clearing files exclude state');
				// Remove the currently saved config, since it was directly edited
				void this.clearExcludeConfiguration();
			}
		}

		if (mode === ToggleMode.GitIgnore || mode === ToggleMode.Both) {
			// Check if git ignore setting was changed externally
			const savedGitIgnore = this.getSavedGitIgnoreState();
			if (savedGitIgnore != null) {
				const currentGitIgnore = this.getGitIgnoreConfiguration();
				if (currentGitIgnore !== !savedGitIgnore) {
					Logger.log('FilesExcludeController.onOtherConfigurationChanged()', 'clearing git ignore state');
					void this.clearGitIgnoreState();
				}
			}
		}
	}

	async applyConfiguration() {
		// If we have saved state, then we are already applied so exit
		if (this._working || this.toggled) return;

		Logger.log('FilesExcludeController.applyConfiguration()');

		try {
			this._working = true;
			const mode = this.getCurrentMode();
			const promises: Thenable<void>[] = [];

			// Handle files.exclude
			if (mode === ToggleMode.Files || mode === ToggleMode.Both) {
				const exclude = this.getExcludeConfiguration();
				if (exclude != null) {
					await this.saveExcludeConfiguration(exclude);

					const appliedExcludes: StoredFilesExcludes = {
						key: exclude.key,
						globalValue: exclude.globalValue == null ? undefined : {},
						workspaceValue: exclude.workspaceValue == null ? undefined : {},
					};

					if (exclude.globalValue != null && appliedExcludes.globalValue != null) {
						const apply: FilesExcludeConfiguration = Object.create(null);
						for (const key of Object.keys(exclude.globalValue)) {
							appliedExcludes.globalValue[key] = apply[key] = false;
						}

						promises.push(
							configuration.updateAny<CoreConfiguration, FilesExcludeConfiguration>(
								'files.exclude',
								apply,
								ConfigurationTarget.Global,
							),
						);
					}

					if (exclude.workspaceValue != null && appliedExcludes.workspaceValue != null) {
						const apply: FilesExcludeConfiguration = Object.create(null);
						for (const key of Object.keys(exclude.workspaceValue)) {
							appliedExcludes.workspaceValue[key] = apply[key] = false;
						}

						promises.push(
							configuration.updateAny<CoreConfiguration, FilesExcludeConfiguration>(
								'files.exclude',
								apply,
								ConfigurationTarget.Workspace,
							),
						);
					}

					await this.saveAppliedExcludeConfiguration(appliedExcludes);
				}
			}

			// Handle explorer.excludeGitIgnore
			if (mode === ToggleMode.GitIgnore || mode === ToggleMode.Both) {
				const currentGitIgnore = this.getGitIgnoreConfiguration();
				if (currentGitIgnore) {
					// Save the current state and set to false to show git-ignored files
					await this.saveGitIgnoreState(currentGitIgnore);
					promises.push(
						configuration.updateAny<CoreConfiguration, boolean>(
							'explorer.excludeGitIgnore',
							false,
							this.getGitIgnoreConfigurationTarget(),
						),
					);
				}
			}

			if (promises.length > 0) {
				await Promise.allSettled(promises);
			}
		} catch (ex) {
			Logger.error(ex);
			await this.clearAllStates();
		} finally {
			Logger.log('FilesExcludeController.applyConfiguration()', 'done');

			this._working = false;
			this._onDidToggle.fire();
		}
	}

	async restoreConfiguration() {
		// If we don't have saved state, then we don't have anything to restore so exit
		if (this._working || !this.toggled) return;

		Logger.log('FilesExcludeController.restoreConfiguration()');

		try {
			this._working = true;
			const mode = this.getCurrentMode();
			const promises: Thenable<void>[] = [];

			// Handle files.exclude restoration
			if (mode === ToggleMode.Files || mode === ToggleMode.Both) {
				const excludes = this.getSavedExcludeConfiguration();
				if (excludes != null) {
					if (excludes.globalValue != null) {
						promises.push(
							configuration.updateAny<CoreConfiguration, FilesExcludeConfiguration>(
								'files.exclude',
								excludes.globalValue,
								ConfigurationTarget.Global,
							),
						);
					}
					if (excludes.workspaceValue != null) {
						promises.push(
							configuration.updateAny<CoreConfiguration, FilesExcludeConfiguration>(
								'files.exclude',
								excludes.workspaceValue,
								ConfigurationTarget.Workspace,
							),
						);
					}
				}
			}

			// Handle explorer.excludeGitIgnore restoration
			if (mode === ToggleMode.GitIgnore || mode === ToggleMode.Both) {
				const savedGitIgnore = this.getSavedGitIgnoreState();
				if (savedGitIgnore != null) {
					promises.push(
						configuration.updateAny<CoreConfiguration, boolean>(
							'explorer.excludeGitIgnore',
							savedGitIgnore,
							this.getGitIgnoreConfigurationTarget(),
						),
					);
				}
			}

			// Remove the currently saved config, since we just restored it
			await this.clearAllStates();

			if (promises.length > 0) {
				await Promise.allSettled(promises);
			}
		} catch (ex) {
			Logger.error(ex);
			await this.clearAllStates();
		} finally {
			Logger.log('FilesExcludeController.restoreConfiguration()', 'done');

			this._working = false;
			this._onDidToggle.fire();
		}
	}

	async toggleConfiguration() {
		if (this._working) return;

		Logger.log('FilesExcludeController.toggleConfiguration()');

		if (this.toggled) {
			await this.restoreConfiguration();
		} else {
			await this.applyConfiguration();
		}
	}

	get canToggle() {
		const mode = this.getCurrentMode();
		let canToggleFiles = false;
		let canToggleGitIgnore = false;

		if (mode === ToggleMode.Files || mode === ToggleMode.Both) {
			const exclude = this.getExcludeConfiguration();
			canToggleFiles = exclude != null && (exclude.globalValue != null || exclude.workspaceValue != null);
		}

		if (mode === ToggleMode.GitIgnore || mode === ToggleMode.Both) {
			canToggleGitIgnore = true; // Always available
		}

		return canToggleFiles || canToggleGitIgnore;
	}

	get toggled() {
		const mode = this.getCurrentMode();

		if (mode === ToggleMode.Files) {
			return this.hasSavedExcludeConfiguration();
		} else if (mode === ToggleMode.GitIgnore) {
			return this.hasSavedGitIgnoreState();
		} else {
			// Both
			return this.hasSavedExcludeConfiguration() || this.hasSavedGitIgnoreState();
		}
	}

	private async clearExcludeConfiguration() {
		await this.saveAppliedExcludeConfiguration(undefined);
		await this.saveExcludeConfiguration(undefined);
	}

	private async clearGitIgnoreState() {
		await this.storage.storeWorkspace('gitIgnoreSavedState', undefined);
	}

	private async clearAllStates() {
		await this.clearExcludeConfiguration();
		await this.clearGitIgnoreState();
	}

	private getCurrentMode(): ToggleMode {
		return configuration.get('mode') ?? ToggleMode.Files;
	}

	private getAppliedExcludeConfiguration(): StoredFilesExcludes | undefined {
		return this.storage.getWorkspace('appliedState');
	}

	private getExcludeConfiguration(): StoredFilesExcludes | undefined {
		return configuration.inspectAny<CoreConfiguration, Record<string, boolean>>('files.exclude');
	}

	private getGitIgnoreConfiguration(): boolean {
		return configuration.getAny<CoreConfiguration, boolean>('explorer.excludeGitIgnore') ?? true;
	}

	private getGitIgnoreConfigurationTarget(): ConfigurationTarget {
		const inspect = configuration.inspectAny<CoreConfiguration, boolean>('explorer.excludeGitIgnore');
		if (inspect?.workspaceValue != null) {
			return ConfigurationTarget.Workspace;
		}
		return ConfigurationTarget.Global;
	}

	private getSavedExcludeConfiguration(): StoredFilesExcludes | undefined {
		const excludes = this.storage.getWorkspace('savedState');
		this.updateContext();
		return excludes;
	}

	private getSavedGitIgnoreState(): boolean | undefined {
		return this.storage.getWorkspace('gitIgnoreSavedState');
	}

	private hasSavedExcludeConfiguration(): boolean {
		return this.getSavedExcludeConfiguration() != null;
	}

	private hasSavedGitIgnoreState(): boolean {
		return this.getSavedGitIgnoreState() != null;
	}

	private saveAppliedExcludeConfiguration(excludes: StoredFilesExcludes | undefined): Promise<void> {
		return this.storage.storeWorkspace('appliedState', excludes);
	}

	private saveExcludeConfiguration(excludes: StoredFilesExcludes | undefined): Promise<void> {
		return this.storage.storeWorkspace('savedState', excludes);
	}

	private saveGitIgnoreState(state: boolean): Promise<void> {
		return this.storage.storeWorkspace('gitIgnoreSavedState', state);
	}

	private _loaded = false;
	private updateContext() {
		const toggled = this.toggled;
		void setContext('toggleexcludedfiles:toggled', toggled);
		if (!this._loaded) {
			this._loaded = true;
			void setContext('toggleexcludedfiles:loaded', true);
		}
	}
}
