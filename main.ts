import { Plugin, PluginSettingTab, App, Setting, Notice, Tasks } from 'obsidian';
import simpleGit, { SimpleGit } from 'simple-git';
import * as fs from 'fs';
import * as path from 'path';

interface GitSettings {
	gitHubRepo: string;
	gitHubUser: string;
	gitHubPat: string;
}

const DEFAULT_SETTINGS: GitSettings = {
	gitHubRepo: '',
	gitHubUser: '',
	gitHubPat: ''
};

//TODO: Create a class for the configuration with each aspect and a general isConfigured boolean flag

//NOTE: Configure commands to control git
//NOTE: Switch to GitHub REST API so it works on mobile or just make a separate plugin

export default class ObsidianGitSync extends Plugin {
	settings: GitSettings;
	git: SimpleGit = simpleGit((this.app.vault.adapter as any).basePath);
	gitIntervalId: NodeJS.Timer;

	doAutoCommit = true;
	intervalTime = 60000;

	statusBarText: HTMLSpanElement;

	httpsUrl = /^https:\/\/github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+\.git$/;
	sshUrl = /^git@github\.com:[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+\.git$/;

	async onload() {
		await this.loadSettings();

		if (await this.git.checkIsRepo())
			await this.fetchVault();

		this.startGitInterval()

		this.addSettingTab(new GitSyncSettingTab(this.app, this));

		this.statusBarText = this.addStatusBarItem().createEl('span', { text: 'Git Sync: Started' });

		await this.isConfigured()

		// Stop interval and commit changes right before closing the app
		this.app.workspace.on('quit', (tasks: Tasks) => {
			tasks.add(async () => {
				await this.stopGitInterval();
				await this.pushVault();
			});
		});
	}

	async onunload() {
		await this.stopGitInterval();
		await this.pushVault();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async isConfigured() {
		if (!await this.git.checkIsRepo() || this.settings.gitHubRepo === DEFAULT_SETTINGS.gitHubRepo &&
			this.settings.gitHubUser === DEFAULT_SETTINGS.gitHubUser &&
			this.settings.gitHubPat === DEFAULT_SETTINGS.gitHubPat) {
			this.statusBarText.textContent = 'Git Sync: Needs configuration';
		}
	}

	startGitInterval() {
		console.log('Git timer started')
		this.gitIntervalId = setInterval(async () => {
			if (this.doAutoCommit)
				await this.addAndCommitVault();
		}, this.intervalTime);
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

			if (!isRepo) {
				const repoUrl = this.settings.gitHubRepo;

				if (this.httpsUrl.test(repoUrl)) {
					if (!this.settings.gitHubPat) {
						new Notice('You need to configure a PAT before initializing the repository', 4000);
						return;
					}

					this.addPatToRepoUrl();
				} else if (this.sshUrl.test(repoUrl)) {
					new Notice('Your remote URL uses SSH, make sure you have configured it', 4000);
				} else {
					new Notice('Invalid repository URL', 4000);
					return;
				}

				await this.git.init();

				try {
					await this.git.addRemote('origin', this.settings.gitHubRepo);
				} catch (remoteError) {
					console.error("Error adding remote:", remoteError);
					message = "Failed to add remote. Please check your repository URL.";
					new Notice(message, 3000);
					return;
				}

				try {
					await this.git.fetch();
					message = "Git repository initialized and remote added successfully.";
				} catch (authError) {
					console.error("Authentication error:", authError);
					message = "Failed to authenticate with GitHub. Please check your credentials.";
				}
			} else {
				message = "Repository already exists";
			}
		} catch (error) {
			console.error("Error initializing Git repo:", error);
			message = "Error initializing repository. Please ensure Git is installed.";
		} finally {
			new Notice(message, 3000);
		}
	}

	async deleteRepo() {
		if (await this.git.checkIsRepo()) {
			const gitDir = path.join((this.app.vault.adapter as any).basePath, '.git');
			fs.rmSync(gitDir, { recursive: true, force: true });
		} else {
			new Notice('There is no repository to delete', 4000)
		}
	}

	//FIX: Maybe the test gives false negative because it has the pat in it
	async addPatToRepoUrl() {
		if (this.settings.gitHubRepo !== '' && this.httpsUrl.test(this.settings.gitHubRepo))
			return this.settings.gitHubRepo = `https://${this.settings.gitHubUser}:${this.settings.gitHubPat}@${this.settings.gitHubRepo.split('//')[1]}`;
	}

	async addAndCommitVault() {
		if (await this.git.checkIsRepo()) {
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

				this.statusBarText.textContent = `Git Sync: Saved at ${formattedDate}`;
			} catch (error) {
				let message = "Error adding and committing changes";
				console.error(message + ": ", error);
				new Notice(message, 3000);
			}
		} else {
			console.log('No repo in this vault');
		}
	}

	async pushVault() {
		try {
			await this.addAndCommitVault();

			// Obtains the current local branch and the remote branches
			const currentBranch = await this.git.revparse(['--abbrev-ref', 'HEAD']);
			const remoteBranches = await this.git.branch(['-r']);

			// Checks if the current local branch exists in the remote and if not it sets it as the main branch
			if (!remoteBranches.all.includes(`origin/${currentBranch}`)) {
				await this.git.push(['--set-upstream', 'origin', currentBranch]);
			} else {
				await this.git.push();
			}
		} catch (error) {
			let message = "Error pushing changes to repository";
			console.error(message + ": ", error);
			new Notice(message, 3000);
		}
	}

	async fetchVault() {
		try {
			await this.git.fetch()
			const status = await this.git.status();

			if (status.behind > 0) {
				console.log(`Local is behind by ${status.behind} commit(s).`);
				console.log('Pulling...')

				try {
					await this.git.pull()
				} catch (error) {
					let message = "Error pulling from remote"
					console.error(message + ": ", error);
					new Notice(message, 3000);
				}
			}
		} catch (error) {
			let message = "Error fetching from remote"
			console.error(message + ": ", error);
			new Notice(message, 3000);
		}
	}

}

class GitSyncSettingTab extends PluginSettingTab {
	plugin: ObsidianGitSync;

	githubPatSetting: Setting
	githubUsernameSetting: Setting

	constructor(app: App, plugin: ObsidianGitSync) {
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
				text.setPlaceholder('Repository Url')
					.setValue(this.plugin.settings.gitHubRepo);
				text.inputEl.onblur = async (event: FocusEvent) => {
					const value = (event.target as HTMLInputElement).value;

					let message = 'Invalid Url, make sure it\'s https or ssh'
					if (this.plugin.httpsUrl.test(value)) {
						(this.githubPatSetting.controlEl.querySelector('input') as HTMLInputElement).style.display = 'block';
						(this.githubUsernameSetting.controlEl.querySelector('input') as HTMLInputElement).style.display = 'block';

						if (await this.plugin.git.checkIsRepo() && this.plugin.settings.gitHubPat !== '') {
							await this.plugin.git.remote(['set-url', 'origin', value]);

							try {
								await this.plugin.git.fetch();
								message = 'Valid HTTPS Url';
							} catch (err) {
								message = 'Error checking auth with new url: ' + err;
							}
						} else if (await this.plugin.git.checkIsRepo() && this.plugin.settings.gitHubPat === '') {
							this.plugin.settings.gitHubRepo = value;
							await this.plugin.saveSettings();
						}
					} else if (this.plugin.sshUrl.test(value)) {
						(this.githubPatSetting.controlEl.querySelector('input') as HTMLInputElement).style.display = 'none';
						(this.githubUsernameSetting.controlEl.querySelector('input') as HTMLInputElement).style.display = 'none';

						if (await this.plugin.git.checkIsRepo())
							await this.plugin.git.remote(['set-url', 'origin', value]);


						message = 'Valid SSH Url, make sure you have configured SSH authentication';
					} else {
						(this.githubPatSetting.controlEl.querySelector('input') as HTMLInputElement).style.display = 'block';
						(this.githubUsernameSetting.controlEl.querySelector('input') as HTMLInputElement).style.display = 'block';
					}

					new Notice(message, 4000)
				};

				text.inputEl.classList.add('git-sync-config-field');
			});

		// GitHub Username
		this.githubUsernameSetting = new Setting(containerEl)
			.setName('GitHub Username')
			.setDesc('Your GitHub username (Not needed if you are using an SSH url).')
			.addText(text => {
				text.setPlaceholder('Username')
				text.setValue(this.plugin.settings.gitHubUser)
				text.onChange(async (value) => {
					this.plugin.settings.gitHubUser = value;
					await this.plugin.saveSettings();
				})
				text.inputEl.classList.add('git-sync-config-field')

				if (this.plugin.sshUrl.test(this.plugin.settings.gitHubRepo))
					text.inputEl.style.display = 'none';
			});

		// GitHub Personal Acces Token
		this.githubPatSetting = new Setting(containerEl)
			.setName('GitHub PAT')
			.setDesc('Personal access token to authenticate yourself. (If you are using an SSH url you don\'t need to fill this field).')
			.addText((text) => {
				text.setPlaceholder('Personal Acces Token')
				text.setValue(this.plugin.settings.gitHubPat)
				text.onChange(async (value) => {
					this.plugin.settings.gitHubPat = value;
					await this.plugin.saveSettings();
					this.plugin.addPatToRepoUrl();
				})
				text.inputEl.classList.add('git-sync-config-field');
				text.inputEl.setAttribute("type", "password");

				if (this.plugin.sshUrl.test(this.plugin.settings.gitHubRepo))
					text.inputEl.style.display = 'none';
			});

		// Create repository button
		new Setting(containerEl)
			.setName('Create vault repository')
			.setDesc('Creates the local repository if not done yet')
			.addButton((button) => {
				button.setButtonText('Create repository')
				button.onClick(_ => this.plugin.createRepo())
				button.buttonEl.classList.add('git-sync-config-field')
			})

		// Toggle commit interval
		new Setting(containerEl)
			.setName('Auto Commit Timer')
			.setDesc('Enables a timer which will save the vault periodically (in miliseconds). If let on 0 or empty, it will use the default value (60000).')
			.addToggle(toggle => toggle
				.setValue(this.plugin.doAutoCommit)
				.onChange(async (value) => {
					this.plugin.doAutoCommit = value;

					let status = '';

					if (value) {
						status = 'Enabled'
					} else {
						status = 'Disabled'
					}

					this.plugin.statusBarText.textContent = 'Git Sync: ' + status;
				})
			)
			.addText(text => {
				text.setValue('' + this.plugin.intervalTime);
				text.inputEl.setAttribute("type", "number");
				text.inputEl.classList.add('git-sync-config-field');
				text.onChange(async (value) => {
					const intValue = parseInt(value, 10);

					if (value === '') {
						this.plugin.intervalTime = 60000;
					}
					else if (isNaN(intValue) || intValue < 0) {
						text.setValue('' + this.plugin.intervalTime);
					} else {
						this.plugin.intervalTime = intValue;
					}
				})
			});

		//TODO: Automatically hide and show buttons depending if theres an existent repo and if theres a remote configure

		// Fetch button
		new Setting(containerEl)
			.setName('Fetch Vault')
			.setDesc('Checks for a new version of the vault and donwloads it')
			.addButton((button) => {
				button.setButtonText('Fetch')
				button.onClick(_ => this.plugin.fetchVault())
				button.buttonEl.classList.add('git-sync-config-field')
			})

		// Push button
		new Setting(containerEl)
			.setName('Push Vault')
			.setDesc('Uploads the current state of the vault')
			.addButton((button) => {
				button.setButtonText('Push')
				button.onClick(_ => {
					this.plugin.pushVault()
					this.plugin.statusBarText.textContent = 'Git Sync: Changes Pushed';
				})
				button.buttonEl.classList.add('git-sync-config-field')
			})

		// Delete repository button
		new Setting(containerEl)
			.setName('Delte repository')
			.setDesc('Deletes the local repository permanently')
			.addButton((button) => {
				button.setButtonText('Delete')
				button.buttonEl.id = 'delete-btn';
				button.onClick(_ => {
					this.plugin.deleteRepo();
					this.plugin.statusBarText.textContent = 'Git Sync: Local repository deleted';
				})
			})
	}
}

