
# Obsidian Git Sync

**Obsidian Git Sync** is a straightforward plugin for [Obsidian](https://obsidian.md) that syncs your vaults across devices (Desktop and Android) with a GitHub repository.


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
2. **Generate Personal Access Token**: Go to `Profile` > `Settings` > `Developer Settings` > `Personal Access Tokens` > `Tokens (classic)`, then click on the dropdown `Generate new token` > `Generate new token (classic)`, this will take youtoa new page, just make sure you select no expiration date if you don't want to be generating new ones over and over
   
4. **Add Your Repository**: Enter your GitHub repository URL in `Settings > Obsidian Git Sync`.
5. **Set Up Authentication**: 
   - For HTTPS, use a Personal Access Token and ensure you enter your GitHub username.
   - For SSH, make sure SSH authentication is configured both in GitHub and on your computer.
6. **Sync Your Vault**: Commit, push, pull, or enable auto-commit for automatic syncing.


## How it works

The plugin uses **Git** to create a local repository in your vault, tracking all changes made to your files. On the backend, the plugin uses the `simple-git` JavaScript library to interact with Git repositories.

- **Local Repository**: Once enabled, the plugin initializes a local Git repository in your Obsidian vault, allowing you to track file changes, commit new changes, and revert to previous versions.
- **Remote Syncing**: The plugin syncs your local repository with a remote GitHub repository. You can choose between two authentication methods:
  - **HTTPS**: Syncing via HTTPS requires a GitHub username and a Personal Access Token (PAT) for authentication. The plugin will handle pushing and pulling changes.
  - **SSH**: If SSH authentication is set up, the plugin uses SSH keys for secure communication with your GitHub repository, ensuring that your sync operations are seamless and secure.
- **Auto-Commit**: You can enable auto-commit, allowing the plugin to automatically commit and push changes at specified intervals, keeping your vault up-to-date without manual intervention.
- **Manual Sync**: You can manually push and pull changes at any time, ensuring that your vault is always synchronized between devices.


## Future Plans

- **Mobile Version**: I am planning to create a mobile version, but it will be a slow development process since I work on this as a hobby in my free time. Stay tuned for updates!

  
## Report an Issue

Feel free to contact me to report any errors or issues. 
Please note that this is a very informal project and I'm no profesional. While I try to keep things working smoothly, there may be occasional bugs or incomplete features. Your feedback is always appreciated!!


## License

Licensed under the [MIT License](https://opensource.org/licenses/MIT).
