import { Modal, App, Setting } from 'obsidian';

export class EmptyVaultModal extends Modal {
	constructor(app: App, onSubmit: (result: boolean) => void) {
		super(app);
		this.setTitle('Warning: Empty Vault Push');
		this.contentEl.innerHTML = `
			<p>
				You are about to push an empty vault to a non-empty Obsidian vault on GitHub. This will result in the <strong>erasure of all the content</strong> 
				currently in the repository.
				<br>
				Although the content can be recovered by manually checking the commit history of GitHub, this process may be complicated if you are not familiar with Git/GitHub.
				<br>
				<strong>Please ensure that this action is intentional</strong> before proceeding. Press "Accept" if you're sure you want to continue. 
				Press "Cancel" if you want to avoid making any changes.
			</p>
			<ul>
				<li>Press <strong>"Accept":</strong> to proceed with erasing and pushing the empty vault.</li>
				<br>
				<li>Press <strong>"Cancel":</strong> to abort the operation.</li>
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
