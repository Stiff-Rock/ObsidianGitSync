import { Modal, App, Setting } from 'obsidian';

export class ConflictModal extends Modal {
	constructor(app: App, onSubmit: (result: boolean) => void) {
		super(app);
		this.setTitle(`Possible Conflict Detected`);
		this.contentEl.innerHTML = `
		<p>
		It looks like there are changes in your local files that haven’t been uploaded to the cloud yet. 
		If you continue, pulling the latest updates from the cloud might overwrite your local changes, 
		and you could lose your work.
		</p>
		<ul>
			<li>Press <strong>"Accept":</strong> Proceed and keep the cloud version. Your local changes will be replaced.</li>
			<br>
			<li>Press <strong>"Cancel":</strong> Stop this process. You can upload your local changes first to avoid losing them.</li>
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
