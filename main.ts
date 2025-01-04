import { Plugin, PluginSettingTab, App, Setting, Notice, Tasks, TextComponent, ButtonComponent, ToggleComponent, TFile } from 'obsidian';
import { Octokit } from "@octokit/rest";
import * as CryptoJS from 'crypto-js';
import { Base64 } from 'js-base64';
import { ConflictModal } from './conflictModal';
import { EmptyVaultModal } from './emptyVaultModal';

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

interface FileInfo {
	path: string;
	type: 'file' | 'dir';
	sha: string;
	modifiedDate: Date;
}

//TODO: Research some possible comflicts and how to handle them
//TODO: Research how to do a single commit whith all files
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
			this.statusBarText = this.addStatusBarItem().createEl('span', { text: 'Git Sync: Started' });

			if (!await this.isOnline()) {
				new Notice('Please check your internet connection and restart thea app/plugin. Any unpushed changes you may do could cause file conflicts in the future.');
				this.statusBarText.textContent = 'Git Sync: Please check your internet connection';
				return;
			}

			this.pullVault();

			this.startGitInterval()

			this.addSettingTab(new GitSyncSettingTab(this.app, this));

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

	async isOnline() {
		try {
			await fetch('https://www.google.com', { method: 'HEAD', mode: 'no-cors' });
			return true;
		} catch (error) {
			return false;
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
	async getLocalFiles(): Promise<FileInfo[]> {
		const files: FileInfo[] = [];

		const tFiles: any = this.app.vault.getFiles()
		const tFolders: any = this.app.vault.getAllFolders();

		const entries = [...tFiles, ...tFolders];

		for (const entry of entries) {
			if (entry) {
				if (tFolders.includes(entry)) {
					files.push({ path: entry.path, type: 'dir', sha: '', modifiedDate: new Date(entry.stat.mtime) })
				} else if (tFiles.includes(entry)) {
					const sha = this.getSha(await this.app.vault.read(entry as TFile));
					files.push({ path: entry.path, type: 'file', sha: sha, modifiedDate: new Date(entry.stat.mtime) })
				}
			}
		}

		return files;
	}

	// Helper function that calculates the SHA in the GitHub method of the given text file content
	getSha(fileContents: string): string {
		let blobString: string;
		const encoder = new TextEncoder();
		const encodedContent = encoder.encode(fileContents);
		const size = encodedContent.length;
		blobString = `blob ${size}\0${fileContents}`;
		return CryptoJS.SHA1(blobString).toString(CryptoJS.enc.Hex);
	}

	// Helper function that calculates the SHA in the GitHub method of the given binary file content
	getShaForBinary(fileRawContents: any) {
		const size = fileRawContents.byteLength;
		const uint8Array = new Uint8Array(fileRawContents);
		let blobString = `blob ${size}\0`;
		for (let i = 0; i < uint8Array.length; i++) {
			blobString += String.fromCharCode(uint8Array[i]);
		}
		const wordArray = CryptoJS.enc.Latin1.parse(blobString);
		return CryptoJS.SHA1(wordArray).toString(CryptoJS.enc.Hex);
	}

	// Uploads the new and updated files into the repository
	async pushVault() {
		if (!this.settings.isConfigured) {
			new Notice('Plugin not configured', 4000);
			return;
		}

		let uploadedFiles: string[] = [];
		try {
			const message = 'Vault saved at ' + this.getCurrentDate();

			const localFiles = await this.getLocalFiles();
			if (!localFiles.length) {
				const response = await this.openEmptyVaultModal();
				if (!response) {
					new Notice('Push Canceled', 4000);
					return;
				}
			}

			const repoFiles: FileInfo[] = await this.fetchVault();

			let filesToDelete: FileInfo[] = []
			if (repoFiles)
				filesToDelete = repoFiles.filter(repoFile =>
					!localFiles.some(localFile => localFile.path === repoFile.path)
				);

			let deletedFiles: string[] = [];
			// Handle file deletion
			if (filesToDelete) {
				for (const file of filesToDelete) {
					if (file.type === 'dir')
						continue;

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

						deletedFiles.push(file.path);
					} catch (error) {
						console.error(`Failed to delete ${file.path}:`, error);
					}

				}
				console.log('Deleted files', deletedFiles);
			}

			// Handle file creation or updating
			for (const file of localFiles) {
				if (file.type === 'dir')
					continue;
				console.log('Checking:', file.path);

				const tFile = this.app.vault.getFileByPath(file.path);
				if (!tFile) {
					console.error('Could not find file in vault:', file);
					continue;
				}



				let fileContent: string | Uint8Array = '';
				let localFileSha: string = '';

				const fileType = this.getFileExtension(file.path);
				if (fileType === 'text') {
					fileContent = await this.app.vault.read(tFile);

					if (!fileContent.length)
						await this.app.vault.modify(tFile, 'Placeholder text so empty files don\'t get deleted by github');

					localFileSha = this.getSha(fileContent);
				}
				else {
					fileContent = new Uint8Array(await this.app.vault.readBinary(tFile));
					localFileSha = this.getShaForBinary(fileContent);
				}

				// Check if file exists to update it
				let repoFile: { base64Content: string, sha: string } = { base64Content: '', sha: '' };
				try {
					//FIX: this shows error in the console when not finding something despite handling it prefectly
					const existingFileResponse: any = await this.octokit.repos.getContent({
						owner: this.settings.gitHubUsername,
						repo: this.settings.gitHubRepoName,
						path: file.path
					});
					repoFile.base64Content = existingFileResponse.data.content.replace(/\n/g, '').trim();
					repoFile.sha = existingFileResponse.data.sha;

					deletedFiles.push(file.path);
				} catch (error) {
					if (error.message.includes('404') || error.message.includes('Not Found') || error.message.includes('This repository is empty')) {
						console.log(`${file.path} not present in repository`);
					} else {
						console.error(`Error checking ${JSON.stringify(file)}:`, error);
						throw error;
					}
				}

				if (localFileSha === repoFile.sha)
					continue;

				const base64Content = this.encodeToBase64(fileContent);

				if (repoFile.base64Content !== base64Content) {
					await this.octokit.repos.createOrUpdateFileContents({
						owner: this.settings.gitHubUsername,
						repo: this.settings.gitHubRepoName,
						path: file.path,
						message: message,
						content: base64Content,
						sha: repoFile.sha,
						committer: {
							name: this.settings.gitHubUsername,
							email: this.settings.userEmail
						}
					});

					console.log('Pushing:', file.path);
					uploadedFiles.push(file.path);
				} else if (base64Content) {
					throw new Error(
						`Error pushing vault, non matching SHAs on matching contents:
							
							File: ${file.path}

							Local file:
								- SHA: ${localFileSha}
								- Content: ${fileContent}
								- Encoded content: ${base64Content}

							Encoded Repo file:  
								- SHA: ${repoFile.sha}
								- Content: ${this.decodeFromBase64(repoFile.base64Content, fileType)}
								- Encoded content: ${repoFile.base64Content}

							Matches:
								- SHA: ${localFileSha === repoFile.sha}
								- Content: ${fileContent.toString() === this.decodeFromBase64(repoFile.base64Content, fileType).toString()}
								- Encoded content: ${base64Content === repoFile.base64Content}\n`
					);
				}

				this.statusBarText.textContent = message;
			}

			console.log('--FINISHED PUSH--');
			console.log('Uploaded files', uploadedFiles);
		} catch (error) {
			console.error(error)
			new Notice('Error pushing vault', 4000);
			return;
		}

		if (!uploadedFiles.length)
			new Notice('Nothing to push', 4000);
		else
			new Notice('Pushed changes succesfully!', 4000);
	}

	// Helper function to encode content string to base64
	encodeToBase64(content: string | ArrayBuffer): string {
		let base64String: string = '';

		if (typeof content === 'string') {
			const encoder = new TextEncoder();
			const utf8Array = encoder.encode(content);
			base64String = Base64.fromUint8Array(utf8Array);
		} else {
			const uint8Array = new Uint8Array(content);
			base64String = Base64.fromUint8Array(uint8Array);
		}

		return base64String;
	}

	// Helper function to decode base64 to uft8 string 
	decodeFromBase64(base64String: string, fileType: 'text' | 'binary'): string | Uint8Array {
		const uint8Array = Base64.toUint8Array(base64String);

		if (fileType === 'text') {
			const decoder = new TextDecoder('utf-8');
			return decoder.decode(uint8Array);
		} else {
			return uint8Array;
		}
	}

	// Function that recursively searches and stores all the folders and files of the repository
	async fetchVault(items: any = null): Promise<FileInfo[]> {
		let files: FileInfo[] = [];

		if (!this.settings.isConfigured) {
			new Notice('Plugin not configured', 4000);
			throw new Error('Error fetching data: Plugin not configured')
		}

		try {
			if (items === null) {
				const response = await this.octokit.repos.getContent({
					owner: this.settings.gitHubUsername,
					repo: this.settings.gitHubRepoName,
					path: ''
				});

				if (Array.isArray(response.data)) {
					files = await this.fetchVault(response.data);
				} else {
					throw new Error('Error fetching data: ' + response)
				}

			} else {
				for (const item of items) {
					// Check for potential conflicts
					const commits = await this.octokit.repos.listCommits({
						owner: this.settings.gitHubUsername,
						repo: this.settings.gitHubRepoName,
						path: item.path,
						per_page: 1,
					});

					let lastModifiedDate = new Date(2000, 0, 0);
					console.log('DEFAULT DATE', lastModifiedDate)
					if (commits.data.length) {
						const lastCommit = commits.data[0];
						const lastModified = lastCommit.commit.author!.date;
						lastModifiedDate = new Date(lastModified as string);
					}

					if (item.type === 'dir') {
						files.push({ path: item.path, type: 'dir', sha: item.sha, modifiedDate: lastModifiedDate });
						const dirResponse = await this.octokit.repos.getContent({
							owner: this.settings.gitHubUsername,
							repo: this.settings.gitHubRepoName,
							path: item.path
						});
						files.push(... await this.fetchVault(dirResponse.data))
					} else if (item.type === 'file') {
						files.push({ path: item.path, type: 'file', sha: item.sha, modifiedDate: lastModifiedDate });
					}
				}
			}
		} catch (error) {
			console.error(error)
			files = [{ path: 'error', type: 'file', sha: '', modifiedDate: new Date(2000, 0, 0) }];
			if (error.message.includes('empty'))
				files[0].path = 'empty'
		} finally {
			return files;
		}
	}

	// Check's for new files in the repository and downloads them
	async pullVault() {
		if (!this.settings.isConfigured) {
			new Notice('Plugin not configured', 4000);
			return;
		}

		try {
			const localFiles = await this.getLocalFiles();
			const repoFiles = await this.fetchVault();

			if (repoFiles[0].path.includes('empty')) {
				new Notice('Repository is empty', 4000);
				return;
			} else if (repoFiles[0].path.includes('error')) {
				throw new Error('Error while fetching repository');
			}

			const repoFilesMap = new Map<string, FileInfo>(repoFiles.map((file: FileInfo) => [file.path, file]));

			const filesToDelete = [];
			const filesToCreateOrUpdate = [];

			for (const localFile of localFiles) {
				const repoFile = repoFilesMap.get(localFile.path);

				if (!repoFile) {
					filesToDelete.push(localFile);
				} else if (repoFile.sha !== localFile.sha) {
					if (repoFile.type === 'file')
						filesToCreateOrUpdate.push(localFile);
				}

				repoFilesMap.delete(localFile.path);
			}

			for (const [, repoFile] of repoFilesMap) {
				filesToCreateOrUpdate.push(repoFile);
			}

			if (filesToDelete.length || filesToCreateOrUpdate.length) {
				const repoFileDate = this.findNewestEntry(repoFiles);
				const localFileDate = this.findNewestEntry(localFiles);

				if (localFileDate.modifiedDate > repoFileDate.modifiedDate) {
					console.warn('COULD BE LOSING DATA');
					console.warn('REPO:', repoFileDate);
					console.warn('LOCAL:', localFileDate);

					const response = await this.openConflictModal();
					console.log('User response:', response);

					if (!response) {
						new Notice('Pull Canceled', 4000);
						return;
					}
				}

				// Handle local file deletion
				if (filesToDelete.length) {
					const filesToDeleteSorted = filesToDelete.sort((a, b) => b.path.split('/').length - a.path.split('/').length);
					for (const file of filesToDeleteSorted) {
						const vaultFile = this.app.vault.getAbstractFileByPath(file.path.replace(/\\/g, '/'));
						if (vaultFile)
							await this.app.vault.delete(vaultFile);
					}
				}

				// Handle local file updating/creating
				if (filesToCreateOrUpdate.length) {
					console.log('Files to create/update', filesToCreateOrUpdate)
					for (const file of filesToCreateOrUpdate) {
						this.downloadRepoFiles(file);
					}
				}

				console.log('--FINISHED PULL--');
				new Notice('Vault updated succesfully', 4000);

			} else {
				new Notice('Nothing to update', 4000);
			}
		} catch (error) {
			console.error(error);
			new Notice('Error pulling changes', 4000);
		}
	}

	// Helper function to get the most recent date on an array of FileInfo 
	findNewestEntry(entries: FileInfo[]) {
		return entries.reduce((a, b) => (a.modifiedDate > b.modifiedDate ? a : b));
	}

	async openConflictModal(): Promise<boolean> {
		return await new Promise<boolean>((resolve) => {
			new ConflictModal(this.app, resolve).open();
		});

	}

	async openEmptyVaultModal(): Promise<boolean> {
		return await new Promise<boolean>((resolve) => {
			new EmptyVaultModal(this.app, resolve).open();
		});
	}


	// Helper function that fetches and and creates the repository files and folders
	async downloadRepoFiles(file: FileInfo) {
		const filePath = file.path;
		const vaultPath = filePath.replace(/\\/g, '/');

		if (file.type === 'file') {
			const existingFile = this.app.vault.getAbstractFileByPath(vaultPath);
			const fileContentResponse = await this.octokit.rest.repos.getContent({
				owner: this.settings.gitHubUsername,
				repo: this.settings.gitHubRepoName,
				path: filePath,
			});

			const fileType = this.getFileExtension(file.path);
			const fileContent = this.decodeFromBase64((fileContentResponse.data as any).content, fileType);

			if (fileType === 'text') {
				if (existingFile && existingFile instanceof TFile) {
					await this.app.vault.modify(existingFile, fileContent as string);
					console.log(`Updated file: ${vaultPath}`);
				} else {
					await this.app.vault.adapter.write(filePath, fileContent as string);
					console.log(`Created file: ${vaultPath}`);
				}
			} else {
				await this.app.vault.adapter.write(filePath, fileContent as string);
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
		}
	}

	getFileExtension(file: string): 'text' | 'binary' {
		const textExtensions = ['txt', 'json', 'html', 'css', 'js', 'md', 'xml', 'csv', 'yml', 'yaml', 'canvas'];
		const binaryExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'pdf', 'mp4', 'avi', 'zip', 'tar', 'mp3', 'wav'];

		const fileExtension = (file.split('.').pop() || '').toLowerCase();

		if (textExtensions.includes(fileExtension))
			return 'text';
		else if (binaryExtensions.includes(fileExtension))
			return 'binary';
		else {
			console.warn('Unsupported file extension:', file);
			return 'text';
		}
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
		if (!this.settings.isConfigured)
			return;

		await this.stopGitInterval();
		await this.saveSettings();
		await this.pushVault();
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
