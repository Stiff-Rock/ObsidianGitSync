import { Plugin, PluginSettingTab, App, Setting, Notice, Tasks, TextComponent, ButtonComponent, ToggleComponent, TFile } from 'obsidian';
import { Octokit } from "@octokit/rest";
import * as CryptoJS from 'crypto-js';

class GitSettings {
	private _gitHubRepoName: string = '';

	private _gitHubPat: string = '';
	private _gitHubUsername: string = '';

	private _userEmail: string = '';

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
		if (this._gitHubPat && this._userEmail && this.gitHubRepoName)
			this._isConfigured = true;
		else
			this._isConfigured = false;
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

	// gitHubRepoName getters and setters
	get userEmail(): string {
		return this._userEmail;
	}

	set userEmail(value: string) {
		this._userEmail = value;
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
			this.compareFilesSha()

			//this.pullVault();

			this.startGitInterval()

			this.addSettingTab(new GitSyncSettingTab(this.app, this));

			this.statusBarText = this.addStatusBarItem().createEl('span', { text: 'Git Sync: Started' });

			if (!this.settings.isConfigured)
				this.statusBarText.textContent = 'Git Sync: Needs configuration';
		});

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
				await this.pushVault();
		}, this.settings.intervalTime);
	}

	async stopGitInterval() {
		if (this.gitIntervalId !== null) {
			clearInterval(this.gitIntervalId);
			console.log('Git timer stopped');
		}
	}

	async authUser() {
		if (this.settings.gitHubPat) {
			try {
				this.octokit = new Octokit({ auth: this.settings.gitHubPat });

				const { data: user } = await this.octokit.users.getAuthenticated();

				if (user.login !== this.settings.gitHubUsername)
					this.settings.gitHubUsername = user.login;

				console.log('Logged as', this.settings.gitHubUsername);
				new Notice('User authenticated succesfully', 4000);
			} catch (error) {
				console.error('Error authenticating user:', error)
				new Notice('User could not be authenticated', 4000);
			}
		} else {
			console.error('Not configured')
			console.error(this.settings)
		}
	}

	async createRepo(): Promise<boolean> {
		try {
			const repoName = this.settings.gitHubUsername + '-ObsidianVault-' + this.app.vault.getName();

			const response = await this.octokit.repos.createForAuthenticatedUser({
				name: repoName,
				private: true,
			});
			console.log('Create action response:', response);

			this.settings.gitHubRepoName = repoName;


			new Notice('Succesfully created repository with name' + repoName, 4000);

			return true;
		} catch (error) {
			console.error('Error creating repository', error);
			new Notice('Error creating repository', 4000);

			return false;
		}
	}

	async deleteRepo(): Promise<boolean> {
		try {
			console.log('Deleting: ' + this.settings.gitHubUsername + ' and ' + this.settings.gitHubRepoName)

			const response = await this.octokit.repos.delete({
				owner: this.settings.gitHubUsername,
				repo: this.settings.gitHubRepoName
			});

			console.log('Delete action response:', response);
			this.settings.gitHubRepoName = '';

			new Notice('Succesfully deleted repository', 4000);

			return true;
		} catch (error) {
			console.error('Error deleting repository', error);
			new Notice('Error deleting repository', 4000);

			return false;
		}
	}

	// Helper function to load in an array all the vault's files
	// WARNING: Implement sha to comparing with repo files
	async getFiles(): Promise<{ path: string, type: string, sha: string }[]> {
		const files: { path: string, type: string, sha: string }[] = [];

		const tFiles: any = this.app.vault.getFiles()
		const tFolders: any = this.app.vault.getAllFolders();

		const entries = [...tFiles, ...tFolders];

		for (const entry of entries) {
			if (entry) {
				if (tFolders.includes(entry))
					files.push({ path: entry.path, type: 'dir', sha: '' })
				else if (tFiles.includes(entry))
					files.push({ path: entry.path, type: 'file', sha: '' })
			}
		}

		return files;
	}

	// Pushses files into the repository
	async pushVault() {
		if (this.settings.isConfigured) {
			try {
				const message = 'Vault saved at ' + this.getCurrentDate();

				const localFiles = await this.getFiles();
				console.log('LOCAL FILES:', localFiles)

				const repoFiles: { path: string, type: string, sha: string }[] | undefined = await this.fetchVault();
				console.log('REPO FILES:', repoFiles)

				let filesToDelete: { path: string, type: string, sha: string }[] = []
				if (repoFiles)
					filesToDelete = repoFiles.filter(repoFile =>
						!localFiles.some(localFile => localFile.path === repoFile.path)
					);
				console.log('FILES TO DELETE:', filesToDelete)

				// Handle file deletion
				if (filesToDelete) {
					for (const file of filesToDelete) {
						if (file.type === 'dir')
							continue;

						console.log('PATH DELETION: ' + file.path)

						try {
							console.log(`Deleting ${file.path} from repository`);
							await this.octokit.repos.deleteFile({
								owner: this.settings.gitHubUsername,
								repo: this.settings.gitHubRepoName,
								path: file.path,
								message: `Deleted file ${file.path}`,
								sha: file.sha,
								committer: {
									name: this.settings.gitHubUsername,
									email: this.settings.userEmail
								}
							});
						} catch (error) {
							console.error(`Failed to delete ${file.path}:`, error);
						}
					}
				}

				// Handle file creation or updating
				for (const file of localFiles) {
					if (file.type === 'dir')
						continue;

					const tFile = this.app.vault.getFileByPath(file.path);
					if (!tFile) {
						console.error('Could not find file in vault:', file);
						continue;
					}
					const fileContent = await this.app.vault.read(tFile);
					const base64Content = btoa(fileContent);

					// Check if file exists to update it
					let existingSha: string = '';
					try {
						//FIX: this shows error in the console when not finding something despite handling it prefectly
						const existingFileResponse = await this.octokit.repos.getContent({
							owner: this.settings.gitHubUsername,
							repo: this.settings.gitHubRepoName,
							path: file.path
						});

						existingSha = (existingFileResponse.data as any).sha;
					} catch (error) {
						if (error.message.includes('404') || error.message.includes('Not Found') || error.message.includes('This repository is empty')) {
							console.log('File not present in repository');
						} else {
							console.error(`Error checking ${file}:`, error);
							throw error;
						}
					}

					await this.octokit.repos.createOrUpdateFileContents({
						owner: this.settings.gitHubUsername,
						repo: this.settings.gitHubRepoName,
						path: file.path.replace(/\\/g, '/'),
						message: message,
						content: base64Content,
						committer: {
							name: this.settings.gitHubUsername,
							email: this.settings.userEmail
						},
						sha: existingSha
					});

					this.statusBarText.textContent = message;
				}
			} catch (error) {
				console.error(error)
				new Notice('Error pushing vault', 4000);
			}
		} else {
			new Notice('Plugin not configured', 4000);
		}
	}

	async fetchVault() {
		if (this.settings.isConfigured) {
			try {
				const files: { path: string, type: string, sha: string }[] = [];

				const response = await this.octokit.repos.getContent({
					owner: this.settings.gitHubUsername,
					repo: this.settings.gitHubRepoName,
					path: ''
				});

				if (Array.isArray(response.data)) {
					await this.processDirectories(response.data, files)
				} else {
					console.error('Error fetching data: ' + response)
					return;
				}

				return files;
			} catch (error) {
				new Notice(error, 4000);
			}
		} else {
			new Notice('Plugin not configured', 4000);
		}
	}

	async processDirectories(items: any, files: { path: string, type: string, sha: string }[]) {
		for (const item of items) {
			if (item.type === 'dir') {
				files.push({ path: item.path, type: 'dir', sha: item.sha });
				const dirResponse = await this.octokit.repos.getContent({
					owner: this.settings.gitHubUsername,
					repo: this.settings.gitHubRepoName,
					path: item.path
				});
				await this.processDirectories(dirResponse.data, files)
			} else if (item.type === 'file') {
				files.push({ path: item.path, type: 'file', sha: item.sha });
			}
		}
	}

	//NOTE: For now it gives priority to the repo's content and it does not handle conflicts
	async pullVault() {
		if (this.settings.isConfigured) {
			try {
				const localFiles = await this.getFiles();
				console.log('Local files', localFiles);

				let repoFiles: { path: string, type: string, sha: string }[] | undefined = await this.fetchVault();
				console.log('Repo files:', repoFiles);

				//TODO: Only deleting if local files are older than the ones in the repo so newest changes have priority

				// Stores the files that are on the local vault that are not on the repository to delete them
				let filesToDelete: { path: string, type: string, sha: string }[] = [];
				if (localFiles) {
					filesToDelete = localFiles.filter(localFile => {
						if (repoFiles)
							return !repoFiles.some(repoFile => repoFile.path === localFile.path);
					});
				}
				console.log('FILES TO DELETE:', filesToDelete);

				// Handle file deletion
				if (filesToDelete && filesToDelete.length > 0) {
					console.log('Files to delete: ', filesToDelete)

					const filesToDeleteSorted = filesToDelete.reverse();
					for (const file of filesToDeleteSorted) {
						const vaultFile = this.app.vault.getAbstractFileByPath(file.path.replace(/\\/g, '/'));
						if (vaultFile) {
							await this.app.vault.delete(vaultFile);
						} else {
							console.error('Obsidian could not find the file to delete:\n - File Path: ' + file.path + "\n - File returned by vault: " + vaultFile);
						}
					}
				} else {
					console.log('No files to delete')
				}

				// Handle file download
				await this.downloadRepoFiles()
				this.statusBarText.textContent = 'Git Sync: Vault Updated';
			} catch (error) {
				console.error(error)
				new Notice('Error pulling from repository', 4000);
			}
		} else {
			new Notice('Plugin not configured', 4000);
		}
	}

	// Helper function that fetches and donwloads the repository files and folders
	async downloadRepoFiles(searchPath: string = '') {
		const getContentResponse = await this.octokit.repos.getContent({
			owner: this.settings.gitHubUsername,
			repo: this.settings.gitHubRepoName,
			path: searchPath
		});

		console.log('DATA:', getContentResponse.data)

		for (const file of getContentResponse.data as any) {
			const filePath = file.path;
			const vaultPath = filePath.replace(/\\/g, '/');

			if (file.type === 'file') {
				const existingFile = this.app.vault.getAbstractFileByPath(vaultPath);
				const fileContentResponse = await this.octokit.rest.repos.getContent({
					owner: this.settings.gitHubUsername,
					repo: this.settings.gitHubRepoName,
					path: filePath,
				});

				const fileContent = atob((fileContentResponse.data as any).content);

				if (existingFile && existingFile instanceof TFile) {
					await this.app.vault.modify(existingFile, fileContent);
					console.log(`Updated file: ${vaultPath}`);
				} else {
					await this.app.vault.create(vaultPath, fileContent);
					console.log(`Created file: ${vaultPath}`);
				}
			} else if (file.type === 'dir') {
				const folderExists = this.app.vault.getAbstractFileByPath(vaultPath);

				if (!folderExists) {
					await this.app.vault.createFolder(vaultPath);
					console.log(`Created folder: ${vaultPath}`);
				} else {
					console.log(`Folder already exists: ${vaultPath}`);
				}
				await this.downloadRepoFiles(vaultPath);
			}
		}
	}

	// Calculates the SHA in the GitHub method of the given file content
	getSha(fileContent: string): string {
		const decodedContent = atob(fileContent);
		const size = decodedContent.length;
		const blobString = `blob ${size}\0${decodedContent}`;
		const calculatedSha = CryptoJS.SHA1(blobString).toString(CryptoJS.enc.Hex);

		return calculatedSha;
	}

	// Adds the commads to init, delete, commit, push, fetch, and toggle the interval
	async loadCommands() {

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
				await this.pullVault();
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

	getCurrentDate(): string {
		const now = new Date();
		return now.toLocaleString('en-US', {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
	}

	async checkRepositoryExists(): Promise<boolean> {
		try {
			await this.octokit.repos.get({
				owner: this.settings.gitHubUsername,
				repo: this.settings.gitHubRepoName,
			});
			return true;
		} catch (error) {
			if (error.status === 404) {
				return false;
			} else {
				throw error;
			}
		}
	}

	async closeApp() {
		//if (!this.settings.isConfigured)
		//	return;
		//
		//await this.stopGitInterval();
		//await this.saveSettings();
		//await this.pushVault();
	}
}

class GitSyncSettingTab extends PluginSettingTab {
	plugin: GitSync;

	userEmailText: TextComponent
	gitHubPatText: TextComponent
	gitHubRepoText: TextComponent

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

		// User's github account email
		new Setting(containerEl)
			.setName('Email')
			.addText((text) => {
				this.gitHubPatText = text;
				text.setPlaceholder('Github account email')
				text.setValue(this.plugin.settings.userEmail)
				text.onChange(async value => {
					this.plugin.settings.userEmail = value;
					await this.plugin.saveSettings();

					this.reloadFields();
				})
				text.inputEl.classList.add('git-sync-config-field');
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
					this.plugin.authUser();
					await this.plugin.saveSettings();
					this.reloadFields();
				})
				text.inputEl.classList.add('git-sync-config-field');
				text.inputEl.setAttribute("type", "password");
			});

		// Repository name 
		new Setting(containerEl)
			.setName('GitHub Repository Name')
			.setDesc('Only fill this field with the name of the repository if you are using a manually created repository or if you are migrating to another')
			.addText(text => {
				this.gitHubRepoText = text;
				text.setPlaceholder('Repository name')
				text.setValue(this.plugin.settings.gitHubRepoName);
				text.inputEl.classList.add('git-sync-config-field');
				text.inputEl.onblur = async (event: FocusEvent) => {
					const value = (event.target as HTMLInputElement).value.trim();
					this.plugin.settings.gitHubRepoName = value;

					await this.plugin.saveSettings();

					if (value) {
						if (!await this.plugin.checkRepositoryExists()) {
							new Notice('This repository does not exist or could not be found', 4000);
							this.plugin.settings.gitHubRepoName = '';
						} else {
							new Notice('Repository aviable', 4000);
						}
					}

					this.reloadFields();
				};
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
					await this.plugin.createRepo();
					await this.enableAllFields()
					this.gitHubRepoText.setValue(this.plugin.settings.gitHubRepoName);

					this.reloadFields();
					await this.plugin.saveSettings();
				})

				if (this.plugin.settings.isConfigured)
					button.buttonEl.disabled = true;
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

				if (!this.plugin.settings.isConfigured) {
					toggle.disabled = true;
					this.intervalTimeText.inputEl.disabled = true;
				}
			});

		// Pull button
		new Setting(containerEl)
			.setName('Pull Vault')
			.setDesc('Checks for a new version of the vault and donwloads it')
			.addButton(async button => {
				this.fetchButton = button;
				button.setButtonText('Pull')
				button.buttonEl.classList.add('git-sync-config-field')
				button.onClick(async _ => {
					await this.disableAllFields();

					if (this.plugin.settings.isConfigured) {
						await this.plugin.pullVault()
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
					await this.disableAllFields();
					const response = await this.plugin.deleteRepo();
					await this.enableAllFields();

					if (response)
						this.gitHubRepoText.setValue('')


					this.reloadFields();
					await this.plugin.saveSettings();
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

	reloadFields() {
		if (this.plugin.settings.isConfigured) {
			this.createRepoButton.buttonEl.disabled = true;
			this.deleteRepoButton.buttonEl.disabled = false;
			this.pushButton.buttonEl.disabled = false;
			this.fetchButton.buttonEl.disabled = false;
			this.autoCommitToggleButton.disabled = false;
			this.intervalTimeText.inputEl.disabled = false;
		} else {
			this.createRepoButton.buttonEl.disabled = false;
			this.deleteRepoButton.buttonEl.disabled = true;
			this.pushButton.buttonEl.disabled = true;
			this.fetchButton.buttonEl.disabled = true;
			this.autoCommitToggleButton.disabled = true;
			this.intervalTimeText.inputEl.disabled = true;
		}
	}
}
