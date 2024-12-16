import { Plugin, PluginSettingTab, App, Setting, Notice, Tasks, TextComponent, ButtonComponent, ToggleComponent, Modal } from 'obsidian';
import simpleGit, { SimpleGit } from 'simple-git';
import * as fs from 'fs';
import * as path from 'path';

class GitSettings {
	/*NOTE: Maybe add sepparate boolean values for the strings since you want to store 
	* whatever the user types but that doesn't mean that the values are correct. 
	* Notify of those missing config fields through the status bar*/

	private _gitHubRepo: string = '';
	private _gitHubUser: string = '';
	private _gitHubPat: string = '';

	private _isRepo: boolean = false;
	private _isConfigured: boolean = false;

	private _doAutoCommit: boolean = true;
	private _intervalTime: number = 60000;

	constructor(data?: Partial<GitSettings>) {
		if (data) {
			Object.assign(this, data);
		}
		this.checkAllSet();
	}

	public isUsingSSH(): boolean {
		let sshUrl = /^git@github\.com:[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+\.git$/;
		return sshUrl.test(this._gitHubRepo);
	}

	// Checks if the _gitHubRepo has HTTP format
	public isUsingHTTPS(): boolean {
		let httpsUrl = /^https:\/\/github\.com\/[\w-]+\/[\w-]+(?:\.git)?$/;
		return httpsUrl.test(this._gitHubRepo);
	}

	// Checks the conditions that are required for the plugin to be considered as configured
	private checkAllSet(): void {
		if (this._isRepo && this._gitHubRepo && (this.isUsingSSH() || (this.isUsingHTTPS() && this._gitHubUser && this._gitHubPat)))
			this._isConfigured = true;
		else
			this._isConfigured = false;
	}

	// gitHubRepo getters and setters
	get gitHubRepo(): string {
		return this._gitHubRepo;
	}

	set gitHubRepo(value: string) {
		this._gitHubRepo = value;
		this.checkAllSet();
	}

	// gitHubUser getters and setters
	get gitHubUser(): string {
		return this._gitHubUser;
	}

	set gitHubUser(value: string) {
		this._gitHubUser = value;
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

	// isRepo getters and setters
	get isRepo(): boolean {
		return this._isRepo;
	}

	set isRepo(value: boolean) {
		this._isRepo = value;
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

//NOTE: Switch to GitHub REST API so it works on mobile or just make a separate plugin

export default class GitSync extends Plugin {
	settings: GitSettings;
	git: SimpleGit = simpleGit((this.app.vault.adapter as any).basePath);
	gitIntervalId: NodeJS.Timer;

	statusBarText: HTMLSpanElement;

	async onload() {
		if (!await this.isGitInstalled())
			return;

		await this.loadSettings();

		this.loadCommands();

		// Check for local repos or newer versions and start the interval
		this.app.workspace.onLayoutReady(async () => {

			if (await this.git.checkIsRepo())
				await this.fetchVault();

			this.startGitInterval()

			this.addSettingTab(new GitSyncSettingTab(this.app, this));

			this.statusBarText = this.addStatusBarItem().createEl('span', { text: 'Git Sync: Started' });

			this.settings.isRepo = await this.git.checkIsRepo();

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

	async isGitInstalled() {
		try {
			await this.git.raw('--version');
			return true;
		} catch (error) {
			const message = 'Git is not installed or is not in the system PATH, disabling plugin...';
			console.error(message);
			new Notice(message, 6000);
			return false;
		}
	}

	async onunload() {
		await this.closeApp();
	}

	async loadSettings() {
		let loadedSettings = await this.loadData();

		if (!loadedSettings) {
			this.settings = new GitSettings();
			console.log("No settings found, loading defaults")
		} else {
			this.settings = new GitSettings(loadedSettings);
			console.log("Settings loaded")
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

	async createRepo() {
		let message = 'Unknown error initializing repository';

		try {
			const isRepo = await this.git.checkIsRepo();

			if (isRepo) {
				message = "Repository already exists";
				return;
			}

			if (this.settings.isUsingHTTPS()) {
				if (!this.settings.gitHubPat) {
					message = 'You need to configure a PAT before initializing the repository'
					return;
				}
				await this.initRepoWithHTTPS();
			} else if (this.settings.isUsingSSH()) {
				message = 'Your remote URL uses SSH, make sure you have configured it';
				await this.initRepoWithSSH();
			} else {
				message = 'Invalid or null repository URL';
				return;
			}

			this.settings.isRepo = true;

			try {
				this.fetchVault();
				message = "Git repository initialized and remote added successfully.";
			} catch (authError) {
				console.error("Authentication error:", authError);
				message = "Failed to authenticate with GitHub. Please check your credentials.";
			}

			console.log('Repository initialized');
		} catch (error) {
			console.error("Error initializing Git repo:", error);
			message = "Error initializing repository. Please ensure Git is installed.";
		} finally {
			new Notice(message, 3000);
		}
	}

	async initRepoWithHTTPS() {
		try {
			await this.git.init();
			await this.git.addRemote('origin', this.UrlWithPat());
		} catch (remoteError) {
			console.error("Error adding remote:", remoteError);
			new Notice("Failed to add remote. Please check your repository URL.", 3000);
		}
	}

	async initRepoWithSSH() {
		try {
			await this.git.init();
			await this.git.addRemote('origin', this.settings.gitHubRepo);
		} catch (remoteError) {
			console.error("Error adding remote:", remoteError);
			new Notice("Failed to add remote. Please check your repository URL.", 3000);
		}
	}

	async deleteRepo() {
		try {
			if (await this.git.checkIsRepo()) {
				const gitDir = path.join((this.app.vault.adapter as any).basePath, '.git');
				fs.rmSync(gitDir, { recursive: true, force: true });
				this.settings.isRepo = false;
				console.log('Repository deleted')
			}
		} catch (err) {
			new Notice('Error deleting repo: ' + err);
		}
	}

	UrlWithPat() {
		let url = ''
		if (this.settings.gitHubRepo !== '' && this.settings.isUsingHTTPS())
			url = `https://${this.settings.gitHubUser}:${this.settings.gitHubPat}@${this.settings.gitHubRepo.split('//')[1]}`;
		return url
	}

	async addAndCommitVault() {
		if (await this.git.checkIsRepo()) {
			let message = "Error adding and committing changes";
			try {
				await this.git.add('.');

				const now = new Date();
				const formattedDate = now.toLocaleString('en-US', {
					year: 'numeric',
					month: '2-digit',
					day: '2-digit',
					hour: '2-digit',
					minute: '2-digit',
					second: '2-digit'
				});

				await this.git.commit(`Changes at ${formattedDate}`);
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
		if (!await this.git.checkIsRepo())
			return;

		let message = 'Error pushing changes to repository'
		try {
			await this.addAndCommitVault();
			await this.git.push();
			message = 'Pushed changes';
			console.log(message)
		} catch (error) {
			if (error.message.includes('--set-upstream')) {
				const currentBranch = await this.git.revparse(['--abbrev-ref', 'HEAD']);
				this.git.push(['--set-upstream', 'origin', currentBranch]);
				message = 'Upstream branch set to master and pushed changes';
				console.log(message);
			}
			else if (error.message.includes('non-fast-forward')) {
				await this.openNonFastFowardModal();
			} else if (error.message.includes('[rejected] (fetch first)')) {
				//HACK: Temporal solution is to just pull, but that will fuck up the vault and will need manual sorting.
				this.git.pull();
			} else {
				console.log(message + ": ", error);
			}
		} finally {
			new Notice(message, 4000);
		}
	}

	async fetchVault() {
		let message = "Error pulling from remote"
		try {
			await this.git.fetch()
			const status = await this.git.status();

			if (status.behind > 0) {
				console.log(`Local is behind by ${status.behind} commit(s).`);
				console.log('Pulling...')

				try {
					await this.git.pull()
					message = 'Successfully updated vault';
				} catch (error) {
					console.error(message + ": ", error);
				}
				console.log('Pulled Changes')
			} else {
				message = 'Vault is already up-to-date';
			}
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

			await this.git.pull(['--rebase']);
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
		// Command to initialize the Git repository
		this.addCommand({
			id: 'create-repo',
			name: 'Create Git Repository',
			callback: async () => {
				await this.createRepo();
			},
		});

		// Command to delete the Git repository
		this.addCommand({
			id: 'delete-repo',
			name: 'Delete Git Repository',
			callback: async () => {
				await this.deleteRepo();
			},
		});

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

	async closeApp() {
		if (!await this.isGitInstalled())
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
	gitHubUsernameText: TextComponent

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

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		// Repository Remote Url
		new Setting(containerEl)
			.setName('GitHub Repository Url')
			.setDesc('The Url of the GitHub repository that will store the vault. Use HTTPS unless you have SSH auth configured')
			.addText(text => {
				this.gitHubRepoText = text;
				text.setPlaceholder('Repository Url')
				text.setValue(this.plugin.settings.gitHubRepo);
				text.inputEl.classList.add('git-sync-config-field');
				text.inputEl.onblur = async (event: FocusEvent) => {
					const value = (event.target as HTMLInputElement).value;

					if (this.plugin.settings.gitHubRepo === value)
						return

					this.plugin.settings.gitHubRepo = value;

					let message = 'Invalid Url, make sure it\'s https or ssh'
					if (this.plugin.settings.isUsingHTTPS()) {
						console.log('HTTPS Url')
						this.gitHubPatText.inputEl.disabled = false;
						this.gitHubUsernameText.inputEl.disabled = false;
						if (await this.plugin.git.checkIsRepo() && this.plugin.settings.gitHubPat !== '') {
							await this.plugin.git.remote(['set-url', 'origin', value]);
							try {
								await this.plugin.git.fetch();
								message = 'Verified HTTPS Url';
								await this.plugin.saveSettings();
							} catch (err) {
								message = 'Error checking auth with new url: ' + err;
							}
						} else if (!await this.plugin.git.checkIsRepo() && this.plugin.settings.gitHubPat !== '') {
							this.plugin.settings.gitHubRepo = value;
							await this.plugin.saveSettings();
							message = 'Valid HTTPS Url';
						}
					} else if (this.plugin.settings.isUsingSSH()) {
						console.log('SSH Url')
						this.gitHubPatText.inputEl.disabled = true;
						this.gitHubUsernameText.inputEl.disabled = true;

						if (await this.plugin.git.checkIsRepo())
							await this.plugin.git.remote(['set-url', 'origin', value]);


						message = 'Valid SSH Url, make sure you have configured SSH authentication';

						await this.plugin.saveSettings();
					} else {
						this.gitHubPatText.inputEl.disabled = false;
						this.gitHubUsernameText.inputEl.disabled = false;
					}
					new Notice(message, 4000)
				};
			});

		// GitHub Username
		new Setting(containerEl)
			.setName('GitHub Username')
			.setDesc('Your GitHub username (Not needed if you are using an SSH url).')
			.addText(text => {
				this.gitHubUsernameText = text;
				text.setPlaceholder('Username')
				text.setValue(this.plugin.settings.gitHubUser)
				text.inputEl.onblur = async (event: FocusEvent) => {
					const value = (event.target as HTMLInputElement).value;
					this.plugin.settings.gitHubUser = value;
					await this.plugin.saveSettings();

					if (value === '')
						return

					const url = `https://api.github.com/users/${value}`;
					let message = 'Could not verify username'
					try {
						const response = await fetch(url);

						if (response.status === 200) {
							message = 'Username exists'
						} else if (response.status === 404) {
							message = 'Username does not exist'
						} else {
							message += ': ' + response.status;
						}
					} catch (error) {
						console.error('Error checking username:', error);
					} finally {
						new Notice(message, 4000);
					}
				}
				text.inputEl.classList.add('git-sync-config-field')

				if (this.plugin.settings.isUsingSSH())
					text.inputEl.disabled = true;
			});

		// GitHub Personal Acces Token
		new Setting(containerEl)
			.setName('GitHub PAT')
			.setDesc('Personal access token to authenticate yourself. (If you are using an SSH url you don\'t need to fill this field).')
			.addText((text) => {
				this.gitHubPatText = text;
				text.setPlaceholder('Personal Acces Token')
				text.setValue(this.plugin.settings.gitHubPat)
				text.onChange(async value => {
					this.plugin.settings.gitHubPat = value;
					await this.plugin.saveSettings();
				})
				text.inputEl.classList.add('git-sync-config-field');
				text.inputEl.setAttribute("type", "password");

				if (this.plugin.settings.isUsingSSH())
					text.inputEl.disabled = true;
			});

		// Create repository button
		new Setting(containerEl)
			.setName('Create vault repository')
			.setDesc('Creates the local repository if not done yet')
			.addButton(async button => {
				this.createRepoButton = button;
				button.setButtonText('Create repository')
				button.onClick(async _ => {
					await this.disableAllFields();

					await this.plugin.createRepo()
					if (await this.plugin.git.checkIsRepo()) {
						await this.enableAllFields();

						button.buttonEl.disabled = true;
						this.autoCommitToggleButton.disabled = false;
						this.intervalTimeText.inputEl.disabled = false;
						this.deleteRepoButton.buttonEl.disabled = false;
						this.fetchButton.buttonEl.disabled = false;
						this.pushButton.buttonEl.disabled = false;
					}
				})
				button.buttonEl.classList.add('git-sync-config-field')

				if (await this.plugin.git.checkIsRepo())
					button.buttonEl.disabled = true;
			})

		// Toggle commit interval
		new Setting(containerEl)
			.setName('Auto Commit Timer')
			.setDesc('Sets auto-save interval in seconds. Empty input resets to default (60s), invalid values restore the last valid value.')
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

				if (!await this.plugin.git.checkIsRepo()) {
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

				if (!await this.plugin.git.checkIsRepo())
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

					if (this.plugin.settings.isConfigured) {
						await this.plugin.pushVault()
					} else {
						new Notice('Your remote isn\'t fully configured', 4000);
					}

					await this.enableAllFields();
				})

				if (!await this.plugin.git.checkIsRepo())
					button.buttonEl.disabled = true;
			})

		// Delete repository button
		new Setting(containerEl)
			.setName('Delte repository')
			.setDesc('Deletes the local repository permanently')
			.addButton(async button => {
				this.deleteRepoButton = button;
				button.setButtonText('Delete')
				button.buttonEl.id = 'delete-btn';
				button.onClick(async _ => {
					await this.disableAllFields();

					if (await this.plugin.git.checkIsRepo()) {
						await this.plugin.deleteRepo();

						if (!await this.plugin.git.checkIsRepo()) {
							await this.enableAllFields();

							this.plugin.settings.isRepo = false;

							button.buttonEl.disabled = true;
							this.pushButton.buttonEl.disabled = true;
							this.fetchButton.buttonEl.disabled = true;
							this.intervalTimeText.inputEl.disabled = true;
							this.autoCommitToggleButton.disabled = true;

							this.createRepoButton.buttonEl.disabled = false;
						}
					} else {
						new Notice('No repository to delete', 4000);
					}
				})

				if (!await this.plugin.git.checkIsRepo())
					button.buttonEl.disabled = true;

			})
	}

	enabledFields: (HTMLInputElement | HTMLButtonElement | ToggleComponent)[] = [];

	async disableAllFields() {
		this.enabledFields = [];

		const fields = [
			this.gitHubRepoText.inputEl,
			this.gitHubPatText.inputEl,
			this.gitHubUsernameText.inputEl,
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
