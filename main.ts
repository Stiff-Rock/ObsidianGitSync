import { Plugin, EventRef, PluginSettingTab, App, Setting, Notice } from 'obsidian';
import { start } from 'repl';
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

//TODO: Add periodic commiting system, then push everything at the end

export default class ObsidianGitSync extends Plugin {
	settings: GitSettings;
	git: SimpleGit = simpleGit((this.app.vault.adapter as any).basePath);

	async onload() {
		await this.loadSettings();

		if (await this.git.checkIsRepo())
			await this.fetchVault();

		//this.startGitTimer()

		this.addSettingTab(new GitSyncSettingTab(this.app, this));
	}

	async onunload() {
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async on(name: 'quit', callback: (tasks: Tasks) => any, ctx?: any): EventRef {
		console.log('BYEBYE')
	}

	startGitTimer() {
		console.log('Git timer started')
		setInterval(async () => {
			await this.addAndCommitVault();
		}, 3000);
	}

	async createRepo() {
		let message = 'Unknown error initializing repository'

		try {
			const isRepo = await this.git.checkIsRepo();
			if (!isRepo) {
				await this.git.init();
				//TODO: Check if the remote is correct
				await this.git.addRemote('origin', this.settings.gitHubRepo);
				message = "Git repository initialized";
			} else {
				message = "Repository already exists";
			}
		} catch (error) {
			console.error("Error initializing Git repo:", error);
		} finally {
			new Notice(message, 3000);
		}
	}

	async addAndCommitVault() {
		if (await this.git.checkIsRepo()) {
			try {
				this.git.add('.')

				const date = new Date().toISOString();
				this.git.commit('Changes at ' + date)
				//FIX: I dont think its adding and commiting 
				console.log('Commit - ' + date);
			} catch (error) {
				let message = "Error adding and commiting chagnes"
				console.error(message + ": ", error);
				new Notice(message, 3000);
			}
		} else {
			console.log('No repo in this vault')
		}
	}

	async pushVault() {
		try {

		} catch (error) {
			let message = "Error pushing chagnes to repository"
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

		new Setting(containerEl)
			.setName('GitHub Password/Token')
			.setDesc('Password or personal access token')
			.addText((text) => {
				text
					.setPlaceholder('Password or token')
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

	}
}

