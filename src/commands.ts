import { Disposable, window } from 'vscode';
import { ToggleMode } from './config';
import type { PaletteCommands } from './constants';
import type { Container } from './container';
import { configuration } from './system/configuration';
import { registerCommand } from './system/command';
import type { Command } from './system/decorators/command';
import { createCommandDecorator } from './system/decorators/command';

const registrableCommands: Command<keyof PaletteCommands>[] = [];
const command = createCommandDecorator(registrableCommands);

export class CommandProvider implements Disposable {
	private readonly _disposable: Disposable;

	constructor(private readonly container: Container) {
		this._disposable = Disposable.from(
			...registrableCommands.map(({ name, method }) => registerCommand(name, method, this)),
		);
	}

	dispose() {
		this._disposable.dispose();
	}

	@command('restore')
	restore() {
		return this.container.filesExclude.restoreConfiguration();
	}

	@command('show')
	show() {
		return this.container.filesExclude.applyConfiguration();
	}

	@command('toggle')
	toggle() {
		return this.container.filesExclude.toggleConfiguration();
	}

	@command('setMode')
	async setMode() {
		const currentMode = configuration.get('mode') ?? ToggleMode.Files;

		const modes = [
			{
				label: '$(file) Files',
				description: 'Toggle files.exclude patterns only',
				value: ToggleMode.Files,
				picked: currentMode === ToggleMode.Files,
			},
			{
				label: '$(git-branch) Git Ignore',
				description: 'Toggle explorer.excludeGitIgnore setting only',
				value: ToggleMode.GitIgnore,
				picked: currentMode === ToggleMode.GitIgnore,
			},
			{
				label: '$(files) Both',
				description: 'Toggle both files.exclude and explorer.excludeGitIgnore simultaneously',
				value: ToggleMode.Both,
				picked: currentMode === ToggleMode.Both,
			},
		];

		const selection = await window.showQuickPick(modes, {
			title: 'Toggle Excluded Files: Set Mode',
			placeHolder: 'Choose which exclusions to toggle when using the eye icon',
		});

		if (selection && selection.value !== currentMode) {
			await configuration.updateEffective('mode', selection.value);
		}
	}
}
