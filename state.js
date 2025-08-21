// --- Game Data ---
const projectFiles = {
    name: 'root',
    type: 'folder',
    children: [
        {
            name: 'assets',
            type: 'folder',
            children: [
                {
                    name: 'images',
                    type: 'folder',
                    children: [
                        { name: 'player.png', type: 'sprite', icon: '🖼️' },
                        { name: 'enemy.png', type: 'sprite', icon: '🖼️' },
                    ]
                },
                {
                    name: 'scenes',
                    type: 'folder',
                    children: [
                        { name: 'level1.json', type: 'scene', icon: '📄' },
                    ]
                },
                {
                    name: 'audio',
                    type: 'folder',
                    children: [
                         { name: 'player_walk.mp3', type: 'audio', icon: '🎵' },
                    ]
                }
            ]
        },
        {
            name: 'src',
            type: 'folder',
            children: [
                { name: 'main.js', type: 'file', icon: '📜' },
                { name: 'actions.js', type: 'file', icon: '📜' },
                { name: 'state.js', type: 'file', icon: '📜' },
                { name: 'ui.js', type: 'file', icon: '📜' },
                { name: 'physics.js', type: 'file', icon: '📜' },
                { name: 'phaser-renderer.js', type: 'file', icon: '📜' },
            ]
        }
    ]
};

// --- Scripting Data ---
const projectScripts = {};

// --- State ---
let scenes = [];
let activeSceneId = null;
let sceneCounter = 0;
let nextObjectId = 4;
let currentTool = 'select';

export function initState(initialGameObjects) {
    const initialScene = createNewScene('Scene 1', initialGameObjects);
    activeSceneId = initialScene.id;
}

export function createNewScene(name, gameObjects) {
    sceneCounter++;
    const newScene = {
        id: `scene-${sceneCounter}`,
        name: name || `Scene ${sceneCounter}`,
        gameObjects: JSON.parse(JSON.stringify(gameObjects)),
        editorGameObjects: JSON.parse(JSON.stringify(gameObjects)),
        world: null,
        physicsBodies: new Map(),
        scriptInstances: new Map(),
        simulationState: 'stopped', // 'stopped', 'playing', 'paused'
        selectedObjectId: null
    };
    scenes.push(newScene);
    return newScene;
}

export function getScenes() { return scenes; }
export function getActiveScene() { return scenes.find(s => s.id === activeSceneId); }
export function getActiveSceneId() { return activeSceneId; }
export function setActiveSceneId(id) { activeSceneId = id; }
export function getProjectFiles() { return projectFiles; }
export function getGameObjects() { return getActiveScene()?.gameObjects || []; }
export function getGameObjectById(id) { return getGameObjects().find(obj => obj.id === id); }
export function getSelectedObject() { return getGameObjectById(getActiveScene()?.selectedObjectId); }
export function getSelectedObjectId() { return getActiveScene()?.selectedObjectId; }
export function setSelectedObjectId(id) { 
    const scene = getActiveScene();
    if (scene) scene.selectedObjectId = id;
}
export function getNextObjectId() { return nextObjectId++; }
export function getPhysicsBody(id) { return getActiveScene()?.physicsBodies.get(id); }
export function setPhysicsBody(id, body) { getActiveScene()?.physicsBodies.set(id, body); }
export function deletePhysicsBody(id) { getActiveScene()?.physicsBodies.delete(id); }
export function getSimulationState() { return getActiveScene()?.simulationState; }
export function setSimulationState(state) { 
    const scene = getActiveScene();
    if (scene) scene.simulationState = state;
}
export function isDynamicBody(body) { return body && body.isDynamic(); }

export function getScriptContent(scriptName) { return projectScripts[scriptName]; }
export function saveScriptContent(scriptName, content) { projectScripts[scriptName] = content; }
export function createNewScript(scriptName, content) {
    if (projectScripts.hasOwnProperty(scriptName)) return false;
    projectScripts[scriptName] = content;
    return true;
}

export function getCurrentTool() { return currentTool; }
export function setCurrentTool(tool) { currentTool = tool; }