# Obsidian Git Sync

**Obsidian Git Sync** is a straightforward plugin for [Obsidian](https://obsidian.md) that syncs your vaults with a GitHub repository. Ideal for backups, version control, and working seamlessly across devices.


## Features

- **Sync with Git**: Push and pull changes effortlessly.
- **Auto-commit**: Automatically save your changes.
- **Flexible Authentication**: Works with SSH or HTTPS using a Personal Access Token.
- **User-friendly Setup**: Easy to install and start using.



## Requirements
- Git: You must have Git installed on your machine. [Download Git](https://git-scm.com/downloads).
- Internet Connection: An active internet connection is required to sync your vault with GitHub.
- GitHub Account: You need a GitHub account to create a repository and store your vault’s data.
  


## How to Install

1. [Download the latest release](https://github.com/Stiff-Rock/ObsidianGitSync/releases/latest).
2. Extract the files into a folder and move it to `.obsidian/plugins/` in your vault.
3. Enable the plugin in Obsidian: `Settings > Community Plugins`.



## Getting Started

1. **Create a GitHub Repository**: First, sign up for a GitHub account (if you don't have one) and create a new repository. Whether the repository is public or private is up to you; the plugin should work with either way.
2. **Add Your Repository**: Enter your GitHub repository URL in `Settings > Obsidian Git Sync`.
3. **Set Up Authentication**: 
   - For HTTPS, use a Personal Access Token and ensure you enter your GitHub username.
   - For SSH, make sure SSH authentication is configured both in GitHub and on your computer.
4. **Sync Your Vault**: Commit, push, pull, or enable auto-commit for automatic syncing.



## How it works

The plugin uses **Git** to create a local repository in your vault, tracking all changes made to your files. On the backend, the plugin uses the `simple-git` JavaScript library to interact with Git repositories.

- **Local Repository**: Once enabled, the plugin initializes a local Git repository in your Obsidian vault, allowing you to track file changes, commit new changes, and revert to previous versions.
- **Remote Syncing**: The plugin syncs your local repository with a remote GitHub repository. You can choose between two authentication methods:
  - **HTTPS**: Syncing via HTTPS requires a GitHub username and a Personal Access Token (PAT) for authentication. The plugin will handle pushing and pulling changes.
  - **SSH**: If SSH authentication is set up, the plugin uses SSH keys for secure communication with your GitHub repository, ensuring that your sync operations are seamless and secure.
- **Auto-Commit**: You can enable auto-commit, allowing the plugin to automatically commit and push changes at specified intervals, keeping your vault up-to-date without manual intervention.
- **Manual Sync**: You can manually push and pull changes at any time, ensuring that your vault is always synchronized between devices.



## Future Plans

- **Mobile Version**: I am planning to create a mobile version, but it will be a slow development process since I work on this as a hobby in my free time. Stay tuned for updates!



## Report an Issue

Feel free to contact me to report any errors or issues. 
Please note that this is a very informal project and I'm no profesional. While I try to keep things working smoothly, there may be occasional bugs or incomplete features. Your feedback is always appreciated!!



## License

Licensed under the [MIT License](https://opensource.org/licenses/MIT).
