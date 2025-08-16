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
				workspaceItem.iconPath = new vscode.ThemeIcon('folder');
				items.push(workspaceItem);
			}
			// Add the 'Create Workspace' button at the top
			const createWorkspaceItem = new vscode.TreeItem('Create Workspace', vscode.TreeItemCollapsibleState.None);
			createWorkspaceItem.command = {
				command: 'vscode-workspace-manager.createWorkspace',
				title: 'Create Workspace'
			};
			createWorkspaceItem.iconPath = new vscode.ThemeIcon('add');
			// Add the 'Sync Setting' button in the second position
			const syncSettingItem = new vscode.TreeItem('Sync Setting', vscode.TreeItemCollapsibleState.None);
			syncSettingItem.command = {
				command: 'vscode-workspace-manager.syncSetting',
				title: 'Sync Setting'
			};
			syncSettingItem.iconPath = new vscode.ThemeIcon('sync');
			// Add the 'Load Setting' button in the third position
			const loadSettingItem = new vscode.TreeItem('Load Setting', vscode.TreeItemCollapsibleState.None);
			loadSettingItem.command = {
				command: 'vscode-workspace-manager.loadSetting',
				title: 'Load Setting'
			};
			loadSettingItem.iconPath = new vscode.ThemeIcon('cloud-download');
			items.unshift(loadSettingItem);
			items.unshift(syncSettingItem);
			items.unshift(createWorkspaceItem);
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
		// Get saved project paths for this workspace
		const projectPathsKey = 'projectPaths_' + name;
		const projectPaths: string[] = context.globalState.get<string[]>(projectPathsKey, []);

		if (projectPaths.length === 0) {
			vscode.window.showWarningMessage(`No project paths saved for workspace '${name}'.`);
			return;
		}

		// Create a temporary .code-workspace file with all project paths
		const fs = require('fs');
		const path = require('path');
		const os = require('os');
		const workspaceFilePath = path.join(os.tmpdir(), `vscode-workspace-manager-${Date.now()}.code-workspace`);
		const workspaceData = {
			folders: projectPaths.map(p => ({ path: p })),
			settings: {}
		};
		fs.writeFileSync(workspaceFilePath, JSON.stringify(workspaceData, null, 2));

		// Open the workspace file in a new window
		vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(workspaceFilePath), true);
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

		// Load projectPaths for this workspace
		const projectPathsKey = 'projectPaths_' + oldName;
		const projectPaths: string[] = context.globalState.get<string[]>(projectPathsKey, []);

		// Inject projectPaths into webview HTML as a script
		let html = getEditWorkspaceWebviewHtml(String(oldName), panel);
		html = html.replace('<script>', `<script>\nwindow.initialProjectPaths = ${JSON.stringify(projectPaths)};`);
		panel.webview.html = html;

		// Handle messages from the webview
		panel.webview.onDidReceiveMessage(async message => {
			if (message.command === 'save' && message.newName) {
				const newName = message.newName.trim();
				const idx = workspaceNames.indexOf(String(oldName));
				if (newName.length > 0 && idx !== -1) {
					if (newName !== oldName) {
						workspaceNames[idx] = newName;
						await context.globalState.update(WORKSPACE_NAMES_KEY, workspaceNames);
						treeProvider.refresh();
					}
					// Save project paths for newName
					await context.globalState.update('projectPaths_' + newName, message.projectPaths || []);
					panel.dispose();
				} else if (idx !== -1) {
					// Name unchanged, still save project paths
					await context.globalState.update('projectPaths_' + oldName, message.projectPaths || []);
					panel.dispose();
				}
			} else if (message.command === 'delete' && message.name) {
				const name = String(message.name).trim();
				const idx = workspaceNames.indexOf(name);
				if (idx !== -1) {
					workspaceNames.splice(idx, 1);
					await context.globalState.update(WORKSPACE_NAMES_KEY, workspaceNames);
					await context.globalState.update('projectPaths_' + name, []);
					treeProvider.refresh();
					panel.dispose();
					vscode.window.showInformationMessage(`Workspace '${name}' deleted.`);
				} else {
					vscode.window.showWarningMessage(`Workspace '${name}' not found.`);
				}
			} else if (message.command === 'chooseFolder') {
				const folders = await vscode.window.showOpenDialog({
					canSelectFiles: false,
					canSelectFolders: true,
					canSelectMany: false,
					openLabel: 'Select Folder'
				});
				if (folders && folders.length > 0) {
					panel.webview.postMessage({ command: 'addPath', path: folders[0].fsPath });
				}
			} else if (message.command === 'cancel') {
				panel.dispose();
			}
		}, undefined, context.subscriptions);
	});
	context.subscriptions.push(editWorkspaceNameDisposable);

	// Register the syncSetting command
	const syncSettingDisposable = vscode.commands.registerCommand('vscode-workspace-manager.syncSetting', async () => {
		// Save the entire workspaceNames and projectPaths as a single snapshot in an array
		const config = vscode.workspace.getConfiguration('vscodeWorkspaceManager');
		let projectPathsObj: { [key: string]: string[] } = {};
		let count = 0;
		for (const name of workspaceNames) {
			const projectPathsKey = 'projectPaths_' + name;
			let projectPaths: string[] = context.globalState.get<string[]>(projectPathsKey, []);
			projectPathsObj[name] = projectPaths;
			count++;
		}
		const now = Date.now();
		const snapshot = {
			workspaceNames,
			projectPaths: projectPathsObj,
			timestamp: now
		};
		let snapshots: any[] = config.get('syncSnapshots', []);
		snapshots.push(snapshot);
		await config.update('syncSnapshots', snapshots, vscode.ConfigurationTarget.Global);
		vscode.window.showInformationMessage(`Settings snapshot saved: ${workspaceNames.length} workspaces, ${count} project path sets, timestamp ${now}.`);
	});
	context.subscriptions.push(syncSettingDisposable);


	// Register the loadSetting command
	const loadSettingDisposable = vscode.commands.registerCommand('vscode-workspace-manager.loadSetting', async () => {
		const config = vscode.workspace.getConfiguration('vscodeWorkspaceManager');
		// Get all snapshots from the array
		const snapshots: any[] = config.get('syncSnapshots', []);
		if (!snapshots || snapshots.length === 0) {
			vscode.window.showInformationMessage('No saved settings snapshots found.');
			return;
		}
		// Sort snapshots by timestamp descending
		const sorted = [...snapshots].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
		// Show quick pick with timestamp
		const picks = sorted.map((snap, idx) => ({
			label: `${snap.timestamp ? new Date(snap.timestamp).toLocaleString() : 'no timestamp'}`,
			description: '',
			value: snap
		}));
		const pick = await vscode.window.showQuickPick(picks, {
			placeHolder: 'Select a settings snapshot to load'
		});
		if (!pick) {
			return;
		}
		// Load the selected snapshot
		const snapshot = pick.value as { workspaceNames?: string[]; projectPaths?: { [key: string]: string[] }; timestamp?: number };
		if (!snapshot || !Array.isArray(snapshot.workspaceNames) || typeof snapshot.projectPaths !== 'object') {
			vscode.window.showErrorMessage('Invalid snapshot format.');
			return;
		}
		// Overwrite current settings
		console.log('snapshot', snapshot);
		// Update local workspaceNames and refresh tree
		workspaceNames = snapshot.workspaceNames || [];
		treeProvider.refresh();
		vscode.window.showInformationMessage(`Loaded settings from snapshot at ${snapshot.timestamp ? new Date(snapshot.timestamp).toLocaleString() : 'unknown time'}`);
	});
	context.subscriptions.push(loadSettingDisposable);

	// Helper function to load dialog.html and inject workspace name
	const fs = require('fs');
	const path = require('path');
	function getEditWorkspaceWebviewHtml(oldName: string, panel: vscode.WebviewPanel): string {
		const htmlPath = path.join(context.extensionPath, 'assets', 'dialog.html');
		let html = fs.readFileSync(htmlPath, 'utf8');
		// Inject workspace name value
		html = html.replace('value=""', `value="${oldName}"`);

		// Get webview URIs for Materialize assets
		const cssUri = panel.webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath, 'assets', 'materialize', 'css', 'materialize.min.css')));
		const jsUri = panel.webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath, 'assets', 'materialize', 'js', 'materialize.min.js')));

		// Inject CSS and JS links before </head> and before </body>
		html = html.replace('</head>', `<link rel="stylesheet" href="${cssUri}">\n</head>`);
		html = html.replace('</body>', `<script src="${jsUri}"></script>\n</body>`);
		return html;
	}
}

// This method is called when your extension is deactivated
export function deactivate() { }
