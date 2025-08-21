import { GUI } from 'lil-gui';
import { getActiveScene, getGameObjects, getSelectedObject, getScenes, getActiveSceneId, getProjectFiles, getScriptContent, saveScriptContent, getGameObjectById } from './state.js';
import { onAddGameObject, onAddScene, onHierarchyClick, onPlay, onPause, onStop, onTabClick, selectObject, setTool, updateGameObjectFromUI, deleteGameObject, addScriptToObject } from './actions.js';
import { recreatePhysicsBody } from './physics.js';

let gui;
let phaserRendererInstance;
let codeMirrorInstance;

// --- DOM Elements ---
const hierarchyList = document.getElementById('hierarchy-list');
const inspectorContent = document.getElementById('inspector-content');
const fileTree = document.getElementById('file-tree');
const playButton = document.querySelector('.toolbar button:nth-child(1)');
const pauseButton = document.querySelector('.toolbar button:nth-child(2)');
const stopButton = document.querySelector('.toolbar button:nth-child(3)');
const consoleOutput = document.getElementById('console-output');
const toolSelectBtn = document.getElementById('tool-select');
const toolMoveBtn = document.getElementById('tool-move');
const toolRotateBtn = document.getElementById('tool-rotate');
const toolScaleBtn = document.getElementById('tool-scale');
const sceneTabsContainer = document.getElementById('scene-tabs-container');
const addSceneBtn = document.getElementById('add-scene-btn');
const addGameObjectBtn = document.getElementById('add-gameobject-btn');
const addObjectDropdown = document.getElementById('add-object-dropdown');
const hierarchyContextMenu = document.getElementById('hierarchy-context-menu');
const sceneView = document.querySelector('.scene-view');
const scriptEditorView = document.getElementById('script-editor-view');
const scriptEditorContainer = document.getElementById('script-editor-container');
const scriptEditorFilename = document.getElementById('script-editor-filename');
const scriptEditorCloseBtn = document.getElementById('script-editor-close-btn');
const consoleTabsContainer = document.getElementById('console-tabs-container');
const consoleTabContent = document.getElementById('console-tab-content');
const assetsPanel = document.getElementById('assets-panel');

let contextMenuTargetId = null;
let currentOpenScript = { objectId: null, scriptName: null };

export function initUI(phaserRenderer) {
    phaserRendererInstance = phaserRenderer;

    hierarchyList.addEventListener('click', onHierarchyClick);
    hierarchyList.addEventListener('contextmenu', onHierarchyContextMenu);
    
    playButton.addEventListener('click', onPlay);
    pauseButton.addEventListener('click', onPause);
    stopButton.addEventListener('click', onStop);
    toolSelectBtn.addEventListener('click', () => setTool('select'));
    toolMoveBtn.addEventListener('click', () => setTool('move'));
    toolRotateBtn.addEventListener('click', () => setTool('rotate'));
    toolScaleBtn.addEventListener('click', () => setTool('scale'));
    addSceneBtn.addEventListener('click', onAddScene);
    sceneTabsContainer.addEventListener('click', onTabClick);
    addGameObjectBtn.addEventListener('click', () => {
        addObjectDropdown.style.display = addObjectDropdown.style.display === 'block' ? 'none' : 'block';
    });
    addObjectDropdown.addEventListener('click', onAddGameObject);
    window.addEventListener('click', (event) => {
        if (!addGameObjectBtn.contains(event.target) && !addObjectDropdown.contains(event.target)) {
            addObjectDropdown.style.display = 'none';
        }
        hideContextMenu();
    });
    
    scriptEditorCloseBtn.addEventListener('click', closeScriptEditor);

    consoleTabsContainer.addEventListener('click', onConsoleTabClick);

    hierarchyContextMenu.addEventListener('click', onContextMenuClick);
    window.addEventListener('contextmenu', (event) => {
        if (!hierarchyList.contains(event.target)) {
            hideContextMenu();
        }
    }, true);

    populateFiles();
    populateAssets();
    updateUI();
}

function onConsoleTabClick(event) {
    const tab = event.target.closest('.tab');
    if (!tab) return;

    const tabName = tab.dataset.tab;

    // Update tabs
    consoleTabsContainer.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    // Update content panes in the right content area
    const rightContent = document.querySelector('.console-right-content');
    rightContent.querySelectorAll('.tab-pane').forEach(pane => {
        if (pane.id === `${tabName}-panel`) {
            pane.classList.add('active');
        } else {
            pane.classList.remove('active');
        }
    });
}

export function updateUI() {
    populateHierarchy();
    populateTabs();
    updateInspector();
}

export function logToConsole(message) {
    const div = document.createElement('div');
    const timestamp = new Date().toLocaleTimeString();
    div.textContent = `[${timestamp}] ${message}`;
    consoleOutput.prepend(div);
}

function hideContextMenu() {
    if (hierarchyContextMenu) {
        hierarchyContextMenu.style.display = 'none';
        contextMenuTargetId = null;
    }
}

function onHierarchyContextMenu(event) {
    event.preventDefault();
    const li = event.target.closest('li');
    if (li) {
        const id = parseInt(li.dataset.id, 10);
        contextMenuTargetId = id;
        
        const selectedObject = getSelectedObject();
        if (!selectedObject || selectedObject.id !== id) {
            selectObject(id);
        }
        
        hierarchyContextMenu.style.display = 'block';
        hierarchyContextMenu.style.left = `${event.pageX}px`;
        hierarchyContextMenu.style.top = `${event.pageY}px`;
    } else {
        hideContextMenu();
    }
}

function onContextMenuClick(event) {
    const action = event.target.dataset.action;
    if (action && contextMenuTargetId !== null) {
        switch (action) {
            case 'add-script':
                const scriptName = prompt("Enter script name (e.g., 'PlayerController.js'):");
                if (scriptName) {
                    addScriptToObject(contextMenuTargetId, scriptName);
                }
                break;
            case 'delete':
                deleteGameObject(contextMenuTargetId);
                break;
        }
    }
    hideContextMenu();
}

function populateHierarchy() {
    const scene = getActiveScene();
    if (!scene || !hierarchyList) return;
    hierarchyList.innerHTML = '';
    
    scene.gameObjects.forEach(obj => {
        const li = document.createElement('li');
        li.dataset.id = obj.id;

        const nameSpan = document.createElement('span');
        nameSpan.textContent = obj.name;
        if (obj.name === 'SceneController') {
             li.innerHTML = `<span></span>` + li.innerHTML;
        }
        li.appendChild(nameSpan);

        if (obj.components.scripts && obj.components.scripts.length > 0) {
            const scriptIcon = document.createElement('span');
            scriptIcon.className = 'script-icon';
            scriptIcon.textContent = '📜';
            scriptIcon.title = obj.components.scripts.join(', ');
            scriptIcon.dataset.scriptName = obj.components.scripts[0]; // For now, opens the first script
            scriptIcon.addEventListener('click', (e) => {
                e.stopPropagation();
                openScriptEditor(obj.id, scriptIcon.dataset.scriptName);
            });
            li.appendChild(scriptIcon);
        }

        if (obj.id === scene.selectedObjectId) {
            li.classList.add('selected');
        }
        hierarchyList.appendChild(li);
    });
}

function populateFiles() {
    fileTree.innerHTML = '';
    const projectFiles = getProjectFiles();

    function createTree(container, item) {
        if (item.type === 'folder') {
            const folderLi = document.createElement('li');
            folderLi.className = 'folder';
            
            const folderName = document.createElement('div');
            folderName.className = 'folder-name';
            folderName.innerHTML = `<span class="folder-icon">📁</span> ${item.name}`;
            folderLi.appendChild(folderName);
            
            const childrenUl = document.createElement('ul');
            item.children.forEach(child => createTree(childrenUl, child));
            folderLi.appendChild(childrenUl);

            folderName.addEventListener('click', () => {
                folderLi.classList.toggle('collapsed');
            });

            container.appendChild(folderLi);
        } else {
            const fileLi = document.createElement('li');
            fileLi.className = 'file-item';
            fileLi.innerHTML = `<span class="file-icon">${item.icon || '📄'}</span> ${item.name}`;
            container.appendChild(fileLi);
        }
    }

    const rootUl = document.createElement('ul');
    projectFiles.children.forEach(item => createTree(rootUl, item));
    fileTree.appendChild(rootUl);
}

function populateAssets() {
    assetsPanel.innerHTML = '';
    const assetList = document.createElement('div');
    assetList.id = 'asset-list';
    
    function createAssetItems(item) {
        if (item.type === 'folder') {
            if (item.children) {
                item.children.forEach(child => createAssetItems(child));
            }
        } else {
            const assetItem = document.createElement('div');
            assetItem.className = 'asset-item';
            
            const icon = document.createElement('div');
            icon.className = 'asset-icon';
            icon.textContent = item.icon || '';
            
            const name = document.createElement('div');
            name.className = 'asset-name';
            name.textContent = item.name;
            
            assetItem.appendChild(icon);
            assetItem.appendChild(name);
            assetList.appendChild(assetItem);
        }
    }

    const projectFiles = getProjectFiles();
    createAssetItems(projectFiles);
    assetsPanel.appendChild(assetList);
}

function populateTabs() {
    sceneTabsContainer.innerHTML = '';
    getScenes().forEach(scene => {
        const tab = document.createElement('div');
        tab.className = 'tab';
        tab.textContent = scene.name;
        tab.dataset.sceneId = scene.id;
        if (scene.id === getActiveSceneId()) {
            tab.classList.add('active');
        }
        sceneTabsContainer.appendChild(tab);
    });
}

export function refreshInspector() {
    if (!gui) return;

    function refreshRecursively(container) {
        container.controllers.forEach(controller => {
            controller.updateDisplay();
        });
        container.folders.forEach(folder => {
            refreshRecursively(folder);
        });
    }

    refreshRecursively(gui);
}

function updateInspector() {
    if (gui) {
        gui.destroy();
        gui = null;
    }
    inspectorContent.innerHTML = '';

    const selectedObject = getSelectedObject();
    if (!selectedObject) {
        inspectorContent.innerHTML = '<p>Select an object to inspect its properties.</p>';
        return;
    }

    gui = new GUI({ container: inspectorContent, title: selectedObject.name, width: '100%' });

    for (const componentName in selectedObject.components) {
        const componentData = selectedObject.components[componentName];
        const componentFolder = gui.addFolder(componentName.charAt(0).toUpperCase() + componentName.slice(1));

        for (const propName in componentData) {
            const propValue = componentData[propName];

            if (typeof propValue === 'object' && propValue !== null && ('x' in propValue || 'y' in propValue)) {
                const vectorFolder = componentFolder.addFolder(propName);
                if ('x' in propValue) vectorFolder.add(propValue, 'x', -10, 10, 0.1).name('X').onChange(updateGameObjectFromUI);
                if ('y' in propValue) vectorFolder.add(propValue, 'y', -10, 10, 0.1).name('Y').onChange(updateGameObjectFromUI);
            } else if (componentName === 'transform' && propName === 'rotation') {
                componentFolder.add(componentData, propName, -Math.PI, Math.PI, 0.01).name('Rotation').onChange(updateGameObjectFromUI);
            } else if (componentName === 'sprite' && propName === 'color') {
                componentFolder.addColor(componentData, propName).onChange(updateGameObjectFromUI);
            } else if (componentName === 'sprite' && propName === 'shape') {
                componentFolder.add(componentData, propName, ['box', 'circle']).name('Shape').onChange(() => {
                    if (selectedObject) {
                        phaserRendererInstance.updateObject(selectedObject, true);
                        recreatePhysicsBody(selectedObject.id);
                    }
                });
            } else if (componentName === 'rigidbody' && propName === 'type') {
                 componentFolder.add(componentData, propName, ['dynamic', 'fixed', 'kinematicPositionBased', 'kinematicVelocityBased']).name('Type').onChange(() => recreatePhysicsBody(getSelectedObject()?.id));
            } else if (componentName === 'rigidbody' && propName === 'enabled') {
                 componentFolder.add(componentData, propName).name('Enabled').onChange(() => recreatePhysicsBody(getSelectedObject()?.id));
            } else if (componentName === 'collider' && propName === 'shape') {
                 componentFolder.add(componentData, propName, ['cuboid', 'ball']).name('Shape').onChange(() => recreatePhysicsBody(getSelectedObject()?.id));
            } else if (componentName === 'scripts') {
                // This will be handled separately below
            } else {
                 componentFolder.add(componentData, propName).onChange(updateGameObjectFromUI);
            }
        }
        componentFolder.open();
    }
    
    // Special handling for scripts
    if (selectedObject.components.scripts && selectedObject.components.scripts.length > 0) {
        const scriptsFolder = gui.addFolder('Scripts');
        selectedObject.components.scripts.forEach((scriptName, index) => {
            const scriptController = { name: scriptName };
            // Displaying as a disabled input
            scriptsFolder.add(scriptController, 'name').name(`Script ${index + 1}`).disable();
        });
        scriptsFolder.open();
    }
}

function closeScriptEditor() {
    if (codeMirrorInstance && currentOpenScript.scriptName) {
        saveScriptContent(currentOpenScript.scriptName, codeMirrorInstance.getValue());
        logToConsole(`Saved script: ${currentOpenScript.scriptName}`);
    }

    scriptEditorView.style.display = 'none';
    sceneView.style.display = 'flex';
    if(codeMirrorInstance) {
        codeMirrorInstance = null;
    }
    scriptEditorContainer.innerHTML = '';
    currentOpenScript = { objectId: null, scriptName: null };
}

function openScriptEditor(objectId, scriptName) {
    const content = getScriptContent(scriptName);
    if (content === undefined) {
        logToConsole(`Error: Could not find script content for ${scriptName}`);
        return;
    }
    
    closeScriptEditor(); // Save and close any previously open script

    sceneView.style.display = 'none';
    scriptEditorView.style.display = 'flex';
    
    scriptEditorFilename.textContent = scriptName;
    currentOpenScript = { objectId, scriptName };
    
    codeMirrorInstance = window.CodeMirror(scriptEditorContainer, {
        value: content,
        mode: 'javascript',
        theme: 'material-darker',
        lineNumbers: true,
        tabSize: 2,
    });
    
    setTimeout(() => codeMirrorInstance.refresh(), 1);
}