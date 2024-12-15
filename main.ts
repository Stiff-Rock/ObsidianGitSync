import { Plugin, PluginSettingTab, App, Setting, Notice, Tasks } from 'obsidian';
import simpleGit, { SimpleGit } from 'simple-git';
import * as fs from 'fs';
import * as path from 'path';

class GitSettings {
	/*NOTE: Add sepparate boolean values for the strings since you want to store 
	* whatever the user types but that does not mean that the values are correct. 
	* Notify of those missing configs through the status bar*/

	private _gitHubRepo: string;
	private _gitHubUser: string;
	private _gitHubPat: string

	private _isRepo: boolean;
	private _isConfigured: boolean;

	private _doAutoCommit: boolean;
	private _intervalTime: number;

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
		this._isConfigured = !!this.isRepo &&
			!!this._gitHubRepo &&
			(this.isUsingSSH() || (this.isUsingHTTPS() && !!this._gitHubUser && !!this._gitHubPat));
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

//NOTE: Configure commands to control git
//NOTE: Switch to GitHub REST API so it works on mobile or just make a separate plugin

export default class ObsidianGitSync extends Plugin {
	settings: GitSettings;
	git: SimpleGit = simpleGit((this.app.vault.adapter as any).basePath);
	gitIntervalId: NodeJS.Timer;

	statusBarText: HTMLSpanElement;

	async onload() {
		await this.loadSettings();

		if (await this.git.checkIsRepo())
			await this.fetchVault();

		this.startGitInterval()

		this.addSettingTab(new GitSyncSettingTab(this.app, this));

		this.statusBarText = this.addStatusBarItem().createEl('span', { text: 'Git Sync: Started' });

		if (!this.settings.isConfigured)
			this.statusBarText.textContent = 'Git Sync: Needs configuration';

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
				new Notice("Repository already exists", 4000);
				return;
			}

			if (this.settings.isUsingHTTPS()) {
				if (!this.settings.gitHubPat) {
					new Notice('You need to configure a PAT before initializing the repository', 4000);
					return;
				}
				await this.initRepoWithHTTPS();
			} else if (this.settings.isUsingSSH()) {
				new Notice('Your remote URL uses SSH, make sure you have configured it', 4000);
				await this.initRepoWithSSH();
			} else {
				new Notice('Invalid or null repository URL', 4000);
				return;
			}

			try {
				await this.git.fetch();
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
		let message = 'Error pushing changes to repository'
		try {
			await this.addAndCommitVault();

			// Obtains the current local branch and the remote branches
			const currentBranch = await this.git.revparse(['--abbrev-ref', 'HEAD']);
			const remoteBranches = await this.git.branch(['-r']);

			// Checks if the current local branch exists in the remote and if not it sets it as the main branch
			if (remoteBranches.current !== currentBranch) {
				await this.git.push(['--set-upstream', 'origin', currentBranch]);
				console.log('Upstream branch set')
			} else {
				await this.git.push();
			}
			message = 'Pushed changes';
			console.log('Pushed Changes')
		} catch (error) {
			console.log(message + ": ", error);
		} finally {
			new Notice(message, 3000);
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

	async closeApp() {
		await this.saveSettings();
		await this.stopGitInterval();
		await this.pushVault();
	}
}

class GitSyncSettingTab extends PluginSettingTab {
	plugin: ObsidianGitSync;

	gitHubRepoSettign: Setting
	githubPatSetting: Setting
	githubUsernameSetting: Setting
	createRepoButtonSetting: Setting
	deleteRepoButtonSetting: Setting
	pushButtonSetting: Setting
	fetchButtonSetting: Setting
	toggleCommitIntervalSetting: Setting

	constructor(app: App, plugin: ObsidianGitSync) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		// Repository Remote Url
		this.gitHubRepoSettign = new Setting(containerEl)
			.setName('GitHub Repository Url')
			.setDesc('The Url of the GitHub repository that will store the vault. Use HTTPS unless you have SSH auth configured')
			.addText(text => {
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
						(this.githubPatSetting.controlEl.querySelector('input') as HTMLInputElement).disabled = false;
						(this.githubUsernameSetting.controlEl.querySelector('input') as HTMLInputElement).disabled = false;

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
						(this.githubPatSetting.controlEl.querySelector('input') as HTMLInputElement).disabled = true;
						(this.githubUsernameSetting.controlEl.querySelector('input') as HTMLInputElement).disabled = true;

						if (await this.plugin.git.checkIsRepo())
							await this.plugin.git.remote(['set-url', 'origin', value]);


						message = 'Valid SSH Url, make sure you have configured SSH authentication';

						await this.plugin.saveSettings();
					} else {
						(this.githubPatSetting.controlEl.querySelector('input') as HTMLInputElement).disabled = false;
						(this.githubUsernameSetting.controlEl.querySelector('input') as HTMLInputElement).disabled = false;
					}
					new Notice(message, 4000)
				};
			});

		// GitHub Username
		this.githubUsernameSetting = new Setting(containerEl)
			.setName('GitHub Username')
			.setDesc('Your GitHub username (Not needed if you are using an SSH url).')
			.addText(text => {
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
		this.githubPatSetting = new Setting(containerEl)
			.setName('GitHub PAT')
			.setDesc('Personal access token to authenticate yourself. (If you are using an SSH url you don\'t need to fill this field).')
			.addText((text) => {
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
		this.createRepoButtonSetting = new Setting(containerEl)
			.setName('Create vault repository')
			.setDesc('Creates the local repository if not done yet')
			.addButton(async button => {
				button.setButtonText('Create repository')
				button.onClick(async _ => {
					this.disableAllFields();

					await this.plugin.createRepo()
					if (await this.plugin.git.checkIsRepo()) {
						button.buttonEl.disabled = true;
						(this.toggleCommitIntervalSetting.controlEl.querySelector('input[type="checkbox"]') as HTMLInputElement).disabled = false;
						(this.toggleCommitIntervalSetting.controlEl.querySelector('input[type="number"]') as HTMLInputElement).disabled = false;
						(this.deleteRepoButtonSetting.controlEl.querySelector('button') as HTMLInputElement).disabled = false;
					}

					this.enableAllFields();
				})
				button.buttonEl.classList.add('git-sync-config-field')

				if (await this.plugin.git.checkIsRepo())
					button.buttonEl.disabled = true;
			})

		// Toggle commit interval
		this.toggleCommitIntervalSetting = new Setting(containerEl)
			.setName('Auto Commit Timer')
			.setDesc('Sets auto-save interval in seconds. Empty input resets to default (60s), invalid values restore the last valid value.')
			.addText(text => {
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
				toggle.setValue(this.plugin.settings.doAutoCommit)
				toggle.onChange(async (value) => {
					this.plugin.settings.doAutoCommit = value;
					await this.plugin.saveSettings();

					let status = '';

					if (value) {
						status = 'AutoCommit enabled';
						(this.toggleCommitIntervalSetting.controlEl.querySelector('input[type="number"]') as HTMLInputElement).disabled = false;
					} else {
						status = 'AutoCommit disabled';
						(this.toggleCommitIntervalSetting.controlEl.querySelector('input[type="number"]') as HTMLInputElement).disabled = true;
					}

					this.plugin.statusBarText.textContent = 'Git Sync: ' + status;
				})

				if (!await this.plugin.git.checkIsRepo()) {
					(toggle.toggleEl as HTMLInputElement).disabled = true;
					(this.toggleCommitIntervalSetting.controlEl.querySelector('input[type="number"]') as HTMLInputElement).disabled = true;
				}
			});

		// Fetch button
		this.fetchButtonSetting = new Setting(containerEl)
			.setName('Fetch Vault')
			.setDesc('Checks for a new version of the vault and donwloads it')
			.addButton((button) => {
				button.setButtonText('Fetch')
				button.buttonEl.classList.add('git-sync-config-field')
				button.onClick(async _ => {
					this.disableAllFields();

					if (this.plugin.settings.isConfigured) {
						await this.plugin.fetchVault()
					} else {
						new Notice('Your remote isn\'t fully configured', 4000);
					}

					this.enableAllFields();
				})
			})

		// Push button
		this.pushButtonSetting = new Setting(containerEl)
			.setName('Push Vault')
			.setDesc('Uploads the current state of the vault')
			.addButton((button) => {
				button.setButtonText('Push')
				button.onClick(async _ => {
					this.disableAllFields();

					if (this.plugin.settings.isConfigured) {
						await this.plugin.pushVault()
					} else {
						new Notice('Your remote isn\'t fully configured', 4000);
					}

					this.enableAllFields();
				})
				button.buttonEl.classList.add('git-sync-config-field')
			})

		// Delete repository button
		this.deleteRepoButtonSetting = new Setting(containerEl)
			.setName('Delte repository')
			.setDesc('Deletes the local repository permanently')
			.addButton(async button => {
				button.setButtonText('Delete')
				button.buttonEl.id = 'delete-btn';
				button.onClick(async _ => {
					this.disableAllFields();

					if (await this.plugin.git.checkIsRepo()) {
						await this.plugin.deleteRepo();

						if (!await this.plugin.git.checkIsRepo()) {
							this.plugin.settings.isRepo = false;
							button.buttonEl.disabled = true;
							(this.createRepoButtonSetting.controlEl.querySelector('button') as HTMLInputElement).disabled = false;
						}
					} else {
						new Notice('No repository to delete', 4000);
					}

					this.enableAllFields();
				})

				if (!await this.plugin.git.checkIsRepo())
					button.buttonEl.disabled = true;

			})
	}

	enabledElements: (HTMLInputElement | HTMLButtonElement)[] = [];

	disableAllFields() {
		this.enabledElements = [];

		const inputs = [
			this.gitHubRepoSettign.controlEl.querySelector('input') as HTMLInputElement,
			this.githubPatSetting.controlEl.querySelector('input') as HTMLInputElement,
			this.githubUsernameSetting.controlEl.querySelector('input') as HTMLInputElement,
			this.toggleCommitIntervalSetting.controlEl.querySelector('input[type="number"]') as HTMLInputElement,
			this.toggleCommitIntervalSetting.controlEl.querySelector('input[type="checkbox"]') as HTMLInputElement,
		];

		inputs.forEach(input => {
			if (input && !input.disabled) {
				this.enabledElements.push(input);
				input.disabled = true;
			}
		});

		const buttons = [
			this.createRepoButtonSetting.controlEl.querySelector('button') as HTMLButtonElement,
			this.deleteRepoButtonSetting.controlEl.querySelector('button') as HTMLButtonElement,
			this.pushButtonSetting.controlEl.querySelector('button') as HTMLButtonElement,
			this.fetchButtonSetting.controlEl.querySelector('button') as HTMLButtonElement
		];

		buttons.forEach(button => {
			if (button && !button.disabled) {
				this.enabledElements.push(button);
				button.disabled = true;
			}
		});

		document.body.style.cursor = "progress";
	}

	enableAllFields() {
		this.enabledElements.forEach(element => {
			element.disabled = false;
		});
		this.enabledElements = [];

		document.body.style.cursor = "default";
	}
}

