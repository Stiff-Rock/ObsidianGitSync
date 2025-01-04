
# Obsidian Git Sync

**Obsidian Git Sync** is a straightforward plugin for [Obsidian](https://obsidian.md) that syncs your vaults across devices (See `Future Plans` section for iOS support info) with a GitHub repository.


## Features

- **Sync with GitHub**: Push and pull changes effortlessly.
- **Auto-commit**: Automatically save your changes.
- **User-friendly**: No git/github knowlodge needed.


## Requirements
- Internet Connection: An active internet connection is required to sync your vault with GitHub.
- GitHub Account: You need a GitHub account to create a repository and store your vault’s data.
- GitHub Personal Acces Token (PAT): Generate a PAT to be able to authenticate on the plugin.


## How to Install (Desktop and Android)

1. [Download the latest release](https://github.com/Stiff-Rock/ObsidianGitSync/releases/latest).
2. Extract the files into a folder and move it to `.obsidian/plugins/` in your vault.
3. Enable the plugin in Obsidian: `Settings > Community Plugins`.


## Getting Started

1. **Create a GitHub Account**: First, sign up for a GitHub account (if you don't have one).
2. **Generate Personal Access Token**: Go to `Profile` > `Settings` > `Developer Settings` > `Personal Access Tokens` > `Tokens (classic)`, then click on the dropdown `Generate new token` > `Generate new token (classic)`, this will take you to a configuration page. Just make sure you select no expiration date if you don't want to be generating new ones over and over and give the following permissions to the PAT:
   
<div>
	<img src="https://github.com/user-attachments/assets/a70683be-5981-4c1f-a7f7-33584fd7bcec" alt="PatConfigImage1" width="600" />
</div>

<div>
	<img src="https://github.com/user-attachments/assets/5b6a0a66-b8ba-4088-960f-68ccf1fd2479" alt="PatConfigImage2" width="600" />
</div>

After that, store the PAT somewhere safe.

5. **Authenticate on the plugin**: 
   - Email: Enter your email used for your GitHub account, this is used for commit signing
   - Personal Access Token: Token so the plugin can sync your vault through GitHub.
    
6. **Create the repository**: Press on the "Create Repository" button so the plugin can start synchronizing you vault with GitHub.

## How it works

The plugin uses **Octokit** to interact with the GitHub repository and the **Obsidina API** to sync your local vault files.

- **Remote Syncing**: The plugin syncs your local files to the remote GitHub repository and vice-versa.
- **Auto-Commit**: You can enable auto-commit, allowing the plugin to automatically commit and push changes at specified intervals, keeping your vault up-to-date without manual intervention.
- **Manual Sync**: You can manually push and pull changes at any time, ensuring that your vault is always synchronized between devices.

## Future Plans

- **iOS Support**: The plugin should work on iOS devices but I have yet to test how to install it manually and how it performs.
- **Fine-grained personal access tokens**: I want to test working with Fine-grained PATs for better security.
  
## Report an Issue

Feel free to contact me to report any errors or issues. 
Please note that this is a very informal project and I'm no profesional. While I try to keep things working smoothly, there may be occasional bugs or incomplete features. Your feedback is always appreciated!!

## License

Licensed under the [MIT License](https://opensource.org/licenses/MIT).
