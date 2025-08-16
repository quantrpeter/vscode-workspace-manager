// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "vscode-workspace-manager" is now active!');

	// Persistent storage key
	const WORKSPACE_NAMES_KEY = 'workspaceNames';

	// Load workspace names from globalState
	let workspaceNames: string[] = context.globalState.get<string[]>(WORKSPACE_NAMES_KEY, []);

	// TreeDataProvider for workspace buttons
	class WorkspaceTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
		private _onDidChangeTreeData: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
		readonly onDidChangeTreeData: vscode.Event<void> = this._onDidChangeTreeData.event;

		getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
			return element;
		}
		getChildren(): vscode.ProviderResult<vscode.TreeItem[]> {
			const items: vscode.TreeItem[] = [];
			for (const name of workspaceNames) {
				// Workspace button
				const workspaceItem = new vscode.TreeItem(name, vscode.TreeItemCollapsibleState.None);
				workspaceItem.command = {
					command: 'vscode-workspace-manager.openWorkspaceByName',
					title: 'Open Workspace',
					arguments: [name]
				};
				workspaceItem.contextValue = 'workspaceItem'; // Used for context menu
				items.push(workspaceItem);
			}
			// Add the 'Create Workspace' button at the top
			items.unshift(new vscode.TreeItem('Create Workspace', vscode.TreeItemCollapsibleState.None));
			return items;
		}
		refresh() {
			this._onDidChangeTreeData.fire();
		}
	}

	const treeProvider = new WorkspaceTreeProvider();
	const createWorkspaceButton = vscode.window.createTreeView('createWorkspaceButton', {
		treeDataProvider: treeProvider,
		showCollapseAll: false
	});

	createWorkspaceButton.onDidChangeSelection(e => {
		if (e.selection.length && e.selection[0].label === 'Create Workspace') {
			vscode.commands.executeCommand('vscode-workspace-manager.createWorkspace');
		}
	});

	context.subscriptions.push(createWorkspaceButton);

	// Register the createWorkspace command
	const createWorkspaceDisposable = vscode.commands.registerCommand('vscode-workspace-manager.createWorkspace', async () => {
		const name = await vscode.window.showInputBox({
			prompt: 'Enter a name for the new workspace',
			placeHolder: 'Workspace name',
		});
		if (name && name.trim().length > 0) {
			workspaceNames.push(name.trim());
			await context.globalState.update(WORKSPACE_NAMES_KEY, workspaceNames);
			treeProvider.refresh();
		}
	});
	context.subscriptions.push(createWorkspaceDisposable);

	// Command to handle clicking a workspace name
	const openWorkspaceByNameDisposable = vscode.commands.registerCommand('vscode-workspace-manager.openWorkspaceByName', async (name: string) => {
		vscode.window.showInformationMessage(`Workspace selected: ${name}`);
		// You can add logic here to open a folder or perform other actions
	});
	context.subscriptions.push(openWorkspaceByNameDisposable);

	// Command to handle editing a workspace name using a Webview Panel
	const editWorkspaceNameDisposable = vscode.commands.registerCommand('vscode-workspace-manager.editWorkspaceName', async (item: vscode.TreeItem) => {
		const oldName = typeof item === 'string' ? item : item.label;
		const panel = vscode.window.createWebviewPanel(
			'editWorkspaceName',
			'Edit Workspace Name',
			vscode.ViewColumn.Active,
			{
				enableScripts: true,
				retainContextWhenHidden: false
			}
		);

		panel.webview.html = getEditWorkspaceWebviewHtml(String(oldName));

		// Handle messages from the webview
		panel.webview.onDidReceiveMessage(async message => {
			if (message.command === 'save' && message.newName) {
				const newName = message.newName.trim();
				if (newName.length > 0 && newName !== oldName) {
					const idx = workspaceNames.indexOf(String(oldName));
					if (idx !== -1) {
						workspaceNames[idx] = newName;
						await context.globalState.update(WORKSPACE_NAMES_KEY, workspaceNames);
						treeProvider.refresh();
						panel.dispose();
					}
				}
			} else if (message.command === 'cancel') {
				panel.dispose();
			}
		}, undefined, context.subscriptions);
	});
	context.subscriptions.push(editWorkspaceNameDisposable);

	// Helper function to load dialog.html and inject workspace name
	const fs = require('fs');
	const path = require('path');
	function getEditWorkspaceWebviewHtml(oldName: string): string {
		const htmlPath = path.join(context.extensionPath, 'src', 'dialog.html');
		let html = fs.readFileSync(htmlPath, 'utf8');
		// Inject workspace name value
		html = html.replace('value=""', `value="${oldName}"`);
		return html;
	}
}

// This method is called when your extension is deactivated
export function deactivate() { }
