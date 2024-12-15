import { App, Modal, Setting } from 'obsidian';
export class NonFastForwardModal extends Modal {
	constructor(app: App, onSubmit: (result: boolean) => void) {
		super(app);
		this.setTitle('A conflict has ocurred');
		this.contentEl.innerHTML = `
			<p>Your vault has changes that are not in sync with the uploaded version.</p>
			<ul>
				<li>Press "Confirm" to pull the latest changes and apply your updates on top. The remote changes won’t be visible directly, and you may need to manually add them to your vault.</li>
				<li>Press "Cancel", no changes will be pushed, and you’ll need to resolve the conflict manually (this is not recommended unless you are familiar with Git).</li>
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
