import { Plugin, PluginSettingTab, App, Setting, Notice, Tasks, TextComponent, ButtonComponent, ToggleComponent, Modal } from 'obsidian';
import { Octokit } from "@octokit/rest";

class GitSettings {
	//TODO: MAYBE IS USEFUL TO SAVE SOME USER INFO LIKE THE USERNAME OR THE CREATED REPO NAME 

	private _gitHubRepo: string = '';
	private _gitHubRepoName: string = '';
	private _gitHubPat: string = '';
	private _gitHubUsername: string = '';

	private _isConfigured: boolean = false;

	private _doAutoCommit: boolean = true;
	private _intervalTime: number = 60000;

	constructor(data?: Partial<GitSettings>) {
		if (data) {
			Object.assign(this, data);
		}
		this.checkAllSet();
	}

	// Checks the conditions that are required for the plugin to be considered as configured
	private checkAllSet(): void {
		if (this._gitHubRepo && this._gitHubPat && this.isUsingHTTPS())
			//TODO: comprobar de alguna manera que va
			this._isConfigured = true;
		else
			this._isConfigured = false;
	}

	// Checks if the gitHubRepo has HTTP format
	public isUsingHTTPS(): boolean {
		let httpsUrl = /^https:\/\/github\.com\/[\w-]+\/[\w-]+(?:\.git)?$/;
		return httpsUrl.test(this._gitHubRepo);
	}

	// gitHubRepo getters and setters
	get gitHubRepo(): string {
		return this._gitHubRepo;
	}

	set gitHubRepo(value: string) {
		this._gitHubRepo = value;
		this.checkAllSet();
	}

	// gitHubRepoName getters and setters
	get gitHubRepoName(): string {
		return this._gitHubRepoName;
	}

	set gitHubRepoName(value: string) {
		this._gitHubRepoName = value;
		this.checkAllSet();
	}

	// gitHubPat getters and setters
	get gitHubPat(): string {
		return this._gitHubPat;
	}

	set gitHubPat(value: string) {
		this._gitHubPat = value;
		this.checkAllSet();
	}

	// gitHubRepoName getters and setters
	get gitHubUsername(): string {
		return this._gitHubUsername;
	}

	set gitHubUsername(value: string) {
		this._gitHubUsername = value;
		this.checkAllSet();
	}

	// doAutoCommit getters and setters
	get doAutoCommit(): boolean {
		return this._doAutoCommit;
	}

	set doAutoCommit(value: boolean) {
		this._doAutoCommit = value;
	}

	// intervalTime getters and setters
	get intervalTime(): number {
		return this._intervalTime;
	}

	set intervalTime(value: number) {
		this._intervalTime = value;
	}

	// isConfigured getters and setters
	get isConfigured(): boolean {
		return this._isConfigured;
	}
}

export default class GitSync extends Plugin {
	settings: GitSettings;
	gitIntervalId: NodeJS.Timer;

	octokit: Octokit;

	statusBarText: HTMLSpanElement;

	async onload() {
		await this.loadSettings();

		this.loadCommands();

		// Check for local repos or newer versions and start the interval
		this.app.workspace.onLayoutReady(async () => {

			//TODO: comprobar cambios antes de iniciar y pullearlos	

			this.startGitInterval()

			this.addSettingTab(new GitSyncSettingTab(this.app, this));

			this.statusBarText = this.addStatusBarItem().createEl('span', { text: 'Git Sync: Started' });

			if (!this.settings.isConfigured)
				this.statusBarText.textContent = 'Git Sync: Needs configuration';
		});

		// Stop interval and commit changes right before closing the app
		this.app.workspace.on('quit', (tasks: Tasks) => {
			tasks.add(async () => {
				await this.closeApp();
			});
		});
	}

	async onunload() {
		await this.closeApp();
	}

	async loadSettings() {
		//TODO: GESTIONAR ESTO Y LA CREACION DE LA INSTANCIA DE OCKTOKIT
		let loadedSettings = await this.loadData();

		if (!loadedSettings) {
			this.settings = new GitSettings();
			console.log("No settings found, loading defaults")
		} else {
			this.settings = new GitSettings(loadedSettings);
			console.log("Settings loaded")

			this.authUser();
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	startGitInterval() {
		console.log('Git timer started')
		this.gitIntervalId = setInterval(async () => {
			if (this.settings.doAutoCommit)
				await this.addAndCommitVault();
		}, this.settings.intervalTime);
	}

	async stopGitInterval() {
		if (this.gitIntervalId !== null) {
			clearInterval(this.gitIntervalId);
			console.log('Git timer stopped');
		}
	}

	async authUser() {
		if (this.settings.isConfigured) {
			try {
				this.octokit = new Octokit({ auth: this.settings.gitHubPat });

				const { data: user } = await this.octokit.users.getAuthenticated();

				if (user.login !== this.settings.gitHubUsername)
					this.settings.gitHubUsername = user.login;

				console.log('Logged as', this.settings.gitHubUsername);
			} catch (error) {
				console.error('Error authenticating user:', error)
			}
		} else {
			console.error('Not configured')
			console.error(this.settings)
		}
	}

	//TODO: Use modals to prompt some settings?
	async createRepo() {
		try {
			this.settings.gitHubRepoName = this.settings.gitHubUsername + '-ObsidianVault-' + this.app.vault.getName();

			console.log('Chosen name', this.settings.gitHubRepoName)

			const response = await this.octokit.repos.createForAuthenticatedUser({
				name: this.settings.gitHubRepoName,
				private: true,
			});
			console.log('Create action response:', response);
		} catch (error) {
			console.error('Error creating repository', error);
		}
	}

	//TODO: Handle error such as 404
	async deleteRepo() {
		try {
			console.log('Deleting: ' + this.settings.gitHubUsername + ' and ' + this.settings.gitHubRepoName)

			const response = await this.octokit.repos.delete({
				owner: this.settings.gitHubUsername,
				repo: this.settings.gitHubRepoName
			});
			console.log('Delete action response:', response);
		} catch (error) {
			console.error('Error deleting repository', error);
		}
	}

	async addAndCommitVault() {
		//TODO: ADD AND COMMIT
		if (this.settings.isConfigured) {
			let message = "Error adding and committing changes";
			try {

				const now = new Date();
				const formattedDate = now.toLocaleString('en-US', {
					year: 'numeric',
					month: '2-digit',
					day: '2-digit',
					hour: '2-digit',
					minute: '2-digit',
					second: '2-digit'
				});

				message = 'Changes commited'
				this.statusBarText.textContent = `Git Sync: Saved at ${formattedDate}`;
			} catch (error) {
				console.error(message + ": ", error);
			} finally {
				new Notice(message, 3000);
			}
		} else {
			console.log('No repo in this vault');
		}
	}

	async pushVault() {
		//TODO: PUSH
		if (!this.settings.isConfigured)
			return;

		let message = 'Error pushing changes to repository'
		try {
			await this.addAndCommitVault();
			message = 'Pushed changes';
			console.log(message)
		} catch (error) {
			//WARNING: Cuidado con las ramas
			if (error.message.includes('--set-upstream')) {
				message = 'Upstream branch set to master and pushed changes';
				console.log(message);
			}
			//TODO: SOMEHOW HANDLE CONFLICTS
			else if (error.message.includes('non-fast-forward')) {
				await this.openNonFastFowardModal();
			} else if (error.message.includes('[rejected] (fetch first)')) {
			} else {
				console.log(message + ": ", error);
			}
		} finally {
			new Notice(message, 4000);
		}
	}

	async fetchVault() {
		//TODO: FETCH CHANGES
		let message = "Error pulling from remote"
		try {
		} catch (error) {
			message = "Error fetching from remote"
			console.error(message + ": ", error);
		} finally {
			new Notice(message, 4000);
		}
	}

	async openNonFastFowardModal(): Promise<string> {
		const accept = await new Promise<boolean>((resolve) => {
			new NonFastForwardModal(this.app, resolve).open();
		});

		if (accept)
			return await this.pullRebase();
		else
			return "Error pulling from remote";
	}

	async pullRebase(): Promise<string> {
		try {
			console.log('Non-fast-forward error detected, pulling changes...');

			console.log('Successfully pulled changes');

			await this.pushVault();
			console.log('Pushed changes after pulling remote updates');
			return 'Pushed changes after pulling remote updates'
		} catch (pullError) {
			console.log('Error during pull or push: ' + pullError.message);
			return "Error pulling from remote";
		}
	}

	// adds the commads to init, delete, commit, push, fetch, and toggle the interval
	async loadCommands() {
		// Command to commit changes to the Git repository
		this.addCommand({
			id: 'commit-changes',
			name: 'Commit Changes',
			callback: async () => {
				await this.addAndCommitVault();
			},
		});

		// Command to push changes to the Git repository
		this.addCommand({
			id: 'push-changes',
			name: 'Push Changes',
			callback: async () => {
				await this.pushVault();
			},
		});

		// Command to fetch changes from the remote repository
		this.addCommand({
			id: 'fetch-changes',
			name: 'Fetch Changes',
			callback: async () => {
				await this.fetchVault();
			},
		});

		// Command to toggle the auto-sync interval on or off
		this.addCommand({
			id: 'toggle-interval',
			name: 'Toggle Git Sync Interval',
			callback: async () => {
				if (this.gitIntervalId) {
					// If the interval is running, stop it
					await this.stopGitInterval();
					console.log('Git Sync interval stopped.');
				} else {
					// If the interval is not running, start it
					this.startGitInterval();
					console.log('Git Sync interval started.');
				}
			},
		});
	}

	//TODO: CAMBIAR ESTO
	async closeApp() {
		if (!this.settings.isConfigured)
			return;

		await this.saveSettings();
		await this.stopGitInterval();
		await this.pushVault();
	}
}

class GitSyncSettingTab extends PluginSettingTab {
	plugin: GitSync;

	gitHubRepoText: TextComponent
	gitHubPatText: TextComponent

	createRepoButton: ButtonComponent
	deleteRepoButton: ButtonComponent
	pushButton: ButtonComponent
	fetchButton: ButtonComponent

	autoCommitToggleButton: ToggleComponent
	intervalTimeText: TextComponent

	constructor(app: App, plugin: GitSync) {
		super(app, plugin);
		this.plugin = plugin;
	}

	//TODO: Be more specfic about what 'not configured' means
	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		// Repository Remote Url
		new Setting(containerEl) //TODO: Add a toggle 'custom url' or somthing
			.setName('GitHub Repository Url')
			.setDesc('Only fill this field with an HTTP url if you are using a manually created repository or if you are migrating to another')
			.addText(text => {
				this.gitHubRepoText = text;
				text.setPlaceholder('Repository Url')
				text.setValue(this.plugin.settings.gitHubRepo);
				text.inputEl.classList.add('git-sync-config-field');
				text.inputEl.onblur = async (event: FocusEvent) => {
					this.plugin.settings.gitHubRepo = (event.target as HTMLInputElement).value;

					if (!this.plugin.settings.isUsingHTTPS()) {
						new Notice('Invalid repository url, ensure it is a valid GitHub HTTP url', 4000);
						return;
					}
				};
			});

		// GitHub Personal Acces Token
		new Setting(containerEl)
			.setName('GitHub PAT')
			.addText((text) => {
				this.gitHubPatText = text;
				text.setPlaceholder('Personal Acces Token')
				text.setValue(this.plugin.settings.gitHubPat)
				text.onChange(async value => {
					this.plugin.settings.gitHubPat = value;
					//TODO: notify the suer that the auth works

					this.plugin.authUser();

					await this.plugin.saveSettings();
				})
				text.inputEl.classList.add('git-sync-config-field');
				text.inputEl.setAttribute("type", "password");
			});

		// Create repository button
		new Setting(containerEl)
			.setName('Create vault repository')
			.setDesc('Creates the GitHub repository')
			.addButton(async button => {
				this.createRepoButton = button;
				button.setButtonText('Create repository')
				button.buttonEl.classList.add('git-sync-config-field')
				button.onClick(async _ => {
					await this.disableAllFields();
					this.plugin.createRepo();
					await this.enableAllFields()
				})
			})

		// Toggle commit interval
		new Setting(containerEl)
			.setName('Auto Commit Timer')
			.setDesc('Sets auto-sync interval in seconds. Empty input resets to default (60s), invalid values restore the last valid value.')
			.addText(text => {
				this.intervalTimeText = text;
				text.setValue('' + this.plugin.settings.intervalTime / 1000);
				text.inputEl.setAttribute("type", "number");
				text.inputEl.classList.add('git-sync-config-field');
				text.onChange(async (value) => {
					const intValue = parseInt(value, 10);

					if (value.trim() === "") {
						this.plugin.settings.intervalTime = 60000;
					} else if (isNaN(intValue) || !Number.isInteger(intValue) || intValue <= 0) {
						text.setValue('' + this.plugin.settings.intervalTime / 1000);
					} else {
						this.plugin.settings.intervalTime = intValue * 1000;
					}
				})

				if (!this.plugin.settings.doAutoCommit)
					text.inputEl.disabled = true;
			})
			.addToggle(async toggle => {
				this.autoCommitToggleButton = toggle;
				toggle.setValue(this.plugin.settings.doAutoCommit)
				toggle.onChange(async (value) => {
					this.plugin.settings.doAutoCommit = value;
					await this.plugin.saveSettings();

					let status = '';

					if (value) {
						status = 'AutoCommit enabled';
						this.intervalTimeText.inputEl.disabled = false;
					} else {
						status = 'AutoCommit disabled';
						this.intervalTimeText.inputEl.disabled = true;
					}

					this.plugin.statusBarText.textContent = 'Git Sync: ' + status;
				})

				//TODO: COMPROBAR QUE ESTE CONFIGURADO
				if (!this.plugin.settings.isConfigured) {
					toggle.disabled = true;
					this.intervalTimeText.inputEl.disabled = true;
				}
			});

		// Fetch button
		new Setting(containerEl)
			.setName('Fetch Vault')
			.setDesc('Checks for a new version of the vault and donwloads it')
			.addButton(async button => {
				this.fetchButton = button;
				button.setButtonText('Fetch')
				button.buttonEl.classList.add('git-sync-config-field')
				button.onClick(async _ => {
					await this.disableAllFields();

					if (this.plugin.settings.isConfigured) {
						await this.plugin.fetchVault()
					} else {
						console.log(this.plugin.settings)
						new Notice('Your remote isn\'t fully configured', 4000);
					}

					await this.enableAllFields();
				})

				if (!this.plugin.settings.isConfigured)
					button.buttonEl.disabled = true;
			})

		// Push button
		new Setting(containerEl)
			.setName('Push Vault')
			.setDesc('Uploads the current state of the vault')
			.addButton(async button => {
				this.pushButton = button;
				button.setButtonText('Push')
				button.buttonEl.classList.add('git-sync-config-field')
				button.onClick(async _ => {
					await this.disableAllFields();
					//TODO: CONSIDER ALWAYS REBASING SO NO CONFLICTS CAN OCUR
					if (this.plugin.settings.isConfigured) {
						await this.plugin.pushVault()
					} else {
						new Notice('Your remote isn\'t fully configured', 4000);
					}

					await this.enableAllFields();
				})

				if (!this.plugin.settings.isConfigured)
					button.buttonEl.disabled = true;
			})

		// Delete repository button
		new Setting(containerEl)
			.setName('Delte repository')
			.setDesc('Deletes the repository permanently (Can\'t undo!!)')
			.addButton(async button => {
				this.deleteRepoButton = button;
				button.setButtonText('Delete')
				button.buttonEl.id = 'delete-btn';
				button.onClick(async _ => {
					//TODO: USE DISABLE ADN ENBLE ALL FIELDS
					//
					await this.disableAllFields();
					await this.plugin.deleteRepo();
					await this.enableAllFields();
				})

				if (!this.plugin.settings.isConfigured)
					button.buttonEl.disabled = true;

			})
	}

	enabledFields: (HTMLInputElement | HTMLButtonElement | ToggleComponent)[] = [];

	async disableAllFields() {
		this.enabledFields = [];

		const fields = [
			this.gitHubRepoText.inputEl,
			this.gitHubPatText.inputEl,
			this.createRepoButton.buttonEl,
			this.deleteRepoButton.buttonEl,
			this.pushButton.buttonEl,
			this.fetchButton.buttonEl,
			this.autoCommitToggleButton,
			this.intervalTimeText.inputEl
		]

		for (const field of fields) {
			if (!field.disabled) {
				this.enabledFields.push(field);
				field.disabled = true;
			}
		}

		document.body.style.cursor = "progress";
	}

	async enableAllFields() {
		for (const field of this.enabledFields) {
			field.disabled = false;
		}

		this.enabledFields = [];

		document.body.style.cursor = "default";
	}
}

//NOTE: Maybe reuse the modal for other conflicts and just give it anotehr innterHTML through the constructor 

// Modal class for Non-fast-forward conflicts
class NonFastForwardModal extends Modal {
	constructor(app: App, onSubmit: (result: boolean) => void) {
		super(app);
		this.setTitle('A conflict has ocurred');
		this.contentEl.innerHTML = `
			<p>Your vault has changes that are not in sync with the uploaded version.</p>
			<ul>
				<li>Press "Confirm" to pull the latest changes and apply your updates on top. The remote changes won’t be visible directly, and you may need to manually add them to your vault.</li>
				<li>Press "Cancel", no changes will be pushed, and you’ll need to resolve the conflict manually (this is not recommended unless you are familiar with Git).</li>
			</ul>
		`;

		new Setting(this.contentEl)
			.addButton(button => {
				button.setButtonText('Accept')
					.onClick(() => {
						this.close();
						onSubmit(true);
					});

			})
			.addButton(button => {
				button.setButtonText('Cancel')
					.onClick(() => {
						this.close();
						onSubmit(false);
					});
			});
	}
}
