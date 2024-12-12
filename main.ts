import { Plugin, PluginSettingTab, App, Setting, Notice, Tasks } from 'obsidian';
import simpleGit, { SimpleGit } from 'simple-git';

interface GitSettings {
	gitHubRepo: string;
	gitHubUser: string;
	gitHubPwd: string;
}

const DEFAULT_SETTINGS: GitSettings = {
	gitHubRepo: '',
	gitHubUser: '',
	gitHubPwd: ''
};

//TODO: Configure commands to control git
//TODO: Switch to GitHub REST API so it works on mobile or just make a separate plugin
export default class ObsidianGitSync extends Plugin {
	settings: GitSettings;
	git: SimpleGit = simpleGit((this.app.vault.adapter as any).basePath);
	gitIntervalId: NodeJS.Timer;

	doAutoCommit = true;
	intervalTime = 60000;

	statusBarText: HTMLSpanElement;

	async onload() {
		await this.loadSettings();

		if (await this.git.checkIsRepo())
			await this.fetchVault();

		this.startGitInterval()

		this.addSettingTab(new GitSyncSettingTab(this.app, this));

		this.statusBarText = this.addStatusBarItem().createEl('span', { text: 'Git Sync: Started' });

		await this.isCorrectlyConfigured()

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

	//TODO: Tener en cuenta más factores
	async isCorrectlyConfigured() {
		let isCorrect = true;

		if (!await this.git.checkIsRepo()) {
			isCorrect = false;
			this.statusBarText.textContent = 'Git Sync: No repository';
		}

		return isCorrect;
	}

	//TODO: Be more specific of the errors to the user
	async createRepo() {
		let message = 'Unknown error initializing repository';

		try {
			const isRepo = await this.git.checkIsRepo();

			if (!isRepo) {
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

	//TODO: the pwd auth will not work
	async pushVault() {
		try {
			await this.addAndCommitVault();
			const currentBranch = await this.git.revparse(['--abbrev-ref', 'HEAD']);
			const remoteBranches = await this.git.branch(['-r']);
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

	constructor(app: App, plugin: ObsidianGitSync) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('GitHub Repository Url')
			.setDesc('The Url of the GitHub repository that will store the vault')
			.addText(text => text
				.setPlaceholder('Repository Url')
				.setValue(this.plugin.settings.gitHubRepo)
				.onChange(async (value) => {
					this.plugin.settings.gitHubRepo = value;
					await this.plugin.saveSettings();
				})
				.inputEl.classList.add('git-sync-config-field')
			);

		new Setting(containerEl)
			.setName('GitHub Username')
			.setDesc('Your GitHub username')
			.addText(text => text
				.setPlaceholder('Username')
				.setValue(this.plugin.settings.gitHubUser)
				.onChange(async (value) => {
					this.plugin.settings.gitHubUser = value;
					await this.plugin.saveSettings();
				})
				.inputEl.classList.add('git-sync-config-field')
			);

		//TODO: añadir PAT a url diferenciando https y ssh 
		new Setting(containerEl)
			.setName('GitHub PAT')
			.setDesc('Personal access token which you need to create in your GitHub account (If you have any other authentication methods already configured such as SSH you don\'t need to fill this field).')
			.addText((text) => {
				text
					.setPlaceholder('Personal Acces Token')
					.setValue(this.plugin.settings.gitHubPwd)
					.onChange(async (value) => {
						this.plugin.settings.gitHubPwd = value;
						await this.plugin.saveSettings();
					})
				text.inputEl.classList.add('git-sync-config-field');
				text.inputEl.setAttribute("type", "password");
			});

		new Setting(containerEl)
			.setName('Create vault repository')
			.setDesc('Creates the local repository if not done yet')
			.addButton((button) => {
				button.setButtonText('Create repository')
				button.onClick(_ => this.plugin.createRepo())
				button.buttonEl.classList.add('git-sync-config-field')
			})

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

		new Setting(containerEl)
			.setName('Fetch Vault')
			.setDesc('Checks for a new version of the vault and donwloads it')
			.addButton((button) => {
				button.setButtonText('Fetch')
				button.onClick(_ => this.plugin.fetchVault())
				button.buttonEl.classList.add('git-sync-config-field')
			})

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
	}
}

