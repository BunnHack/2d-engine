import { getActiveScene, getSelectedObject, setSelectedObjectId, setSimulationState, createNewScene, setActiveSceneId, getNextObjectId, getGameObjects, getSimulationState, setCurrentTool, getGameObjectById, createNewScript, getScriptContent, getScenes } from './state.js';
import { logToConsole, updateUI, refreshInspector } from './ui.js';
import { setupPhysics, updatePhysicsPositions, recreatePhysicsBody, deletePhysicsBody as deletePhysicsBodyFromWorld } from './physics.js';

let phaserRendererInstance;
export function provideRenderer(renderer) {
    phaserRendererInstance = renderer;
}

// --- Console override ---
let originalConsole = {};

function overrideConsole() {
    if (originalConsole.log) return; // Already overridden

    originalConsole.log = console.log;
    originalConsole.warn = console.warn;
    originalConsole.error = console.error;
    originalConsole.info = console.info;

    const formatArgs = (args) => {
        return args.map(arg => {
            if (typeof arg === 'object' && arg !== null) {
                try {
                    // A simple way to stringify without circular errors
                    return JSON.stringify(arg, (key, value) => {
                        if (key === 'world' || key === 'parent' || key === 'scene') return '[Object]';
                        return value;
                    });
                } catch (e) {
                    return '[Object]';
                }
            }
            return String(arg);
        }).join(' ');
    };

    console.log = (...args) => {
        logToConsole(`[Log] ${formatArgs(args)}`);
        originalConsole.log.apply(console, args);
    };
    console.warn = (...args) => {
        logToConsole(`[Warn] ${formatArgs(args)}`);
        originalConsole.warn.apply(console, args);
    };
    console.error = (...args) => {
        logToConsole(`[Error] ${formatArgs(args)}`);
        originalConsole.error.apply(console, args);
    };
    console.info = (...args) => {
        logToConsole(`[Info] ${formatArgs(args)}`);
        originalConsole.info.apply(console, args);
    };
}

function restoreConsole() {
    if (originalConsole.log) {
        console.log = originalConsole.log;
        console.warn = originalConsole.warn;
        console.error = originalConsole.error;
        console.info = originalConsole.info;
        originalConsole = {};
    }
}

export function addScriptToObject(id, scriptName) {
    const obj = getGameObjectById(id);
    if (!obj) return;

    if (!obj.components.scripts) {
        obj.components.scripts = [];
    }

    // Basic validation for script name
    if (!scriptName.endsWith('.js')) {
        scriptName += '.js';
    }

    if (obj.components.scripts.includes(scriptName)) {
        logToConsole(`Script '${scriptName}' already exists on object '${obj.name}'.`);
        return;
    }
    
    // Create the script with default content if it's new
    const wasCreated = createNewScript(scriptName, 
`// Script for ${obj.name}
export default class ${scriptName.replace('.js','')} {
    // Called when the script instance is being loaded.
    onAwake(gameObject) {
        console.log('${scriptName} awake for', gameObject.name);
    }

    // Called before the first frame update.
    onStart(gameObject) {
        console.log('${scriptName} started for', gameObject.name);
    }

    // Called every frame.
    onUpdate(gameObject) {
        // console.log('Update called for', gameObject.name);
    }
}
`
    );
    
    if (wasCreated) {
        logToConsole(`Created new script file: ${scriptName}`);
    }

    obj.components.scripts.push(scriptName);
    logToConsole(`Added script '${scriptName}' to object '${obj.name}'.`);
    updateUI(); // This will refresh the inspector and hierarchy
}

export function deleteGameObject(id) {
    const scene = getActiveScene();
    if (!scene) return;

    const obj = scene.gameObjects.find(o => o.id === id);
    if (!obj) return;

    // Remove from gameObjects
    const index = scene.gameObjects.findIndex(o => o.id === id);
    if (index > -1) {
        scene.gameObjects.splice(index, 1);
    }

    // Remove from editorGameObjects if stopped
    if (scene.simulationState === 'stopped') {
        const editorIndex = scene.editorGameObjects.findIndex(o => o.id === id);
        if (editorIndex > -1) {
            scene.editorGameObjects.splice(editorIndex, 1);
        }
    }

    // Remove from renderer
    phaserRendererInstance.removeObject(id);
    
    // Remove physics body
    deletePhysicsBodyFromWorld(id);

    // If it was selected, unselect it
    if (scene.selectedObjectId === id) {
        setSelectedObjectId(null);
    }
    
    updateUI();
    logToConsole(`Deleted object: ${obj.name} (ID: ${id})`);
}

export async function loadScene(name, ...args) {
    const scene = getScenes().find(s => s.name.toLowerCase() === name.toLowerCase());
    if (!scene) {
        logToConsole(`[Error] Scene '${name}' not found.`);
        return;
    }

    await switchScene(scene.id);

    // After switching, find the SceneController and call its onLoad
    const activeScene = getActiveScene();
    if (activeScene && activeScene.simulationState === 'playing') {
        const sceneController = activeScene.gameObjects.find(go => go.name === 'SceneController');
        if (sceneController) {
            const instances = activeScene.scriptInstances.get(sceneController.id);
            if (instances) {
                for (const instance of instances) {
                    if (typeof instance.onLoad === 'function') {
                        try {
                            instance.onLoad(...args);
                        } catch (e) {
                            logToConsole(`[Error] in SceneController onLoad for scene '${name}': ${e}`);
                        }
                    }
                }
            }
        }
    }
}

export function onHierarchyClick(event) {
    const target = event.target.closest('li');
    if (target) {
        const id = parseInt(target.dataset.id, 10);
        selectObject(id);
    }
}

export function onAddGameObject(event) {
    event.preventDefault();
    if (event.target.tagName !== 'A') return;
    
    const type = event.target.dataset.type;
    const scene = getActiveScene();
    if (!scene) return;

    const newObject = {
        id: getNextObjectId(),
        name: `New ${type}`,
        components: {
            transform: { position: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 } }
        }
    };

    switch(type) {
        case 'Rectangle':
            newObject.components.sprite = { color: 0xffffff, shape: 'box' };
            newObject.components.rigidbody = { type: 'dynamic', enabled: false };
            newObject.components.collider = { shape: 'cuboid' };
            break;
        case 'Ellipse':
            newObject.components.sprite = { color: 0xffffff, shape: 'circle' };
            newObject.components.rigidbody = { type: 'dynamic', enabled: false };
            newObject.components.collider = { shape: 'ball' };
            break;
        default:
            logToConsole(`Object type "${type}" not implemented yet.`);
            return;
    }

    scene.gameObjects.push(newObject);
    if(scene.simulationState === 'stopped') {
        scene.editorGameObjects.push(JSON.parse(JSON.stringify(newObject)));
    }
    
    recreatePhysicsBody(newObject.id); // This will create the physics body if components are valid

    phaserRendererInstance.setObjects(scene.gameObjects);
    selectObject(newObject.id);
    
    document.getElementById('add-object-dropdown').style.display = 'none';
    logToConsole(`Added ${type} to the scene.`);
}

export function onAddScene() {
    const newScene = createNewScene(null, []);
    switchScene(newScene.id);
}

export function onTabClick(event) {
    if(event.target.classList.contains('tab')) {
        const sceneId = event.target.dataset.sceneId;
        const scene = getActiveScene();
        if(!scene || sceneId !== scene.id) {
            switchScene(sceneId);
        }
    }
}

export function updateGameObjectFromUI() {
    const selectedObject = getSelectedObject();
    if (selectedObject) {
        phaserRendererInstance.updateObject(selectedObject);
        updatePhysicsPositions(selectedObject);

        if (getSimulationState() === 'stopped') {
            const scene = getActiveScene();
            scene.editorGameObjects = JSON.parse(JSON.stringify(scene.gameObjects));
        }
    }
}

export function setTool(tool) {
    setCurrentTool(tool);
    phaserRendererInstance?.setTool(tool);
    ['tool-select', 'tool-move', 'tool-rotate', 'tool-scale'].forEach(id => document.getElementById(id).classList.remove('active'));
    if (tool === 'select') document.getElementById('tool-select').classList.add('active');
    if (tool === 'move') document.getElementById('tool-move').classList.add('active');
    if (tool === 'rotate') document.getElementById('tool-rotate').classList.add('active');
    if (tool === 'scale') document.getElementById('tool-scale').classList.add('active');
}

export async function switchScene(sceneId) {
    setActiveSceneId(sceneId);
    const scene = getActiveScene();
    if (!scene) return;
    
    // If running, we need to init scripts for the new scene
    if (scene.simulationState === 'playing') {
        await initializeSceneScripts(scene);
    }

    setupPhysics();
    phaserRendererInstance.setObjects(scene.gameObjects);
    phaserRendererInstance.setSelected(null);
    updateUI();
}

export function selectObject(id) {
    const scene = getActiveScene();
    if (!scene) return;

    if (scene.selectedObjectId === id) scene.selectedObjectId = null;
    else scene.selectedObjectId = id;
    
    setSelectedObjectId(scene.selectedObjectId);
    phaserRendererInstance.setSelected(scene.selectedObjectId);
    updateUI();
}

export async function onPlay() {
    const scene = getActiveScene();
    if (!scene) return;
    
    overrideConsole();

    scene.editorGameObjects = JSON.parse(JSON.stringify(scene.gameObjects));
    
    await initializeSceneScripts(scene);

    setSimulationState('playing');
    logToConsole(`Simulation Started in ${scene.name}.`);

    // Call onStart() on all script instances
    for (const [id, instances] of scene.scriptInstances.entries()) {
        const gameObject = getGameObjectById(id);
        if (gameObject) {
            for (const instance of instances) {
                if (typeof instance.onStart === 'function') {
                    instance.onStart(gameObject);
                }
            }
        }
    }
}

export function onPause() {
    setSimulationState('paused');
    logToConsole(`Simulation Paused in ${getActiveScene()?.name}.`);
}

export function onStop() {
    const scene = getActiveScene();
    if (!scene) return;
    setSimulationState('stopped');
    scene.scriptInstances.clear();
    
    if (scene.editorGameObjects) {
        scene.gameObjects = JSON.parse(JSON.stringify(scene.editorGameObjects));
    }
    
    setupPhysics();
    phaserRendererInstance.setObjects(scene.gameObjects);

    const selectedStillExists = scene.gameObjects.some(go => go.id === scene.selectedObjectId);
    if (!selectedStillExists) scene.selectedObjectId = null;
    
    phaserRendererInstance.setSelected(scene.selectedObjectId);
    updateUI();

    restoreConsole();
    logToConsole(`Simulation Stopped in ${scene.name}. Scene restored.`);
}

export function onManipulateObject(gameObject, phase) {
    phaserRendererInstance.updateObject(gameObject);
    updatePhysicsPositions(gameObject);
    if (gameObject.id === getSelectedObject()?.id) refreshInspector();
    if (phase === 'end') {
        recreatePhysicsBody(gameObject.id);
    }
}

async function initializeSceneScripts(scene) {
    // Instantiate scripts and call onAwake
    scene.scriptInstances.clear();
    for (const obj of scene.gameObjects) {
        if (obj.components.scripts && obj.components.scripts.length > 0) {
            const instances = [];
            for (const scriptName of obj.components.scripts) {
                const scriptContent = getScriptContent(scriptName);
                if (scriptContent) {
                    try {
                        const blob = new Blob([scriptContent], { type: 'application/javascript' });
                        const url = URL.createObjectURL(blob);
                        const module = await import(url);
                        const ScriptClass = module.default;
                        if (ScriptClass) {
                            const instance = new ScriptClass();
                            
                            // Add helpers
                            instance.entity = obj;
                            instance.game = {
                                findGameObjectByName(name) {
                                    return getGameObjects().find(go => go.name === name);
                                },
                                loadScene(name, ...args) {
                                    loadScene(name, ...args);
                                }
                            };

                            // Add component accessors
                            for (const componentName in obj.components) {
                                if (componentName !== 'scripts') {
                                    Object.defineProperty(instance, componentName, {
                                        get: () => obj.components[componentName],
                                        configurable: true,
                                        enumerable: true
                                    });
                                }
                            }

                            // Call onAwake immediately after instantiation
                            if (typeof instance.onAwake === 'function') {
                                instance.onAwake(obj);
                            }
                            instances.push(instance);
                        } else {
                            logToConsole(`Error: Script ${scriptName} does not have a default export.`);
                        }
                        URL.revokeObjectURL(url);
                    } catch(e) {
                        logToConsole(`Error loading script ${scriptName} for ${obj.name}: ${e}`);
                    }
                }
            }
            if (instances.length > 0) {
                scene.scriptInstances.set(obj.id, instances);
            }
        }
    }
}