import { PhaserRenderer } from './phaser-renderer.js';
import RAPIER from '@dimforge/rapier2d-compat';
import { initState, getActiveScene, setSimulationState, getGameObjects, getPhysicsBody, isDynamicBody, getGameObjectById } from './state.js';
import { initUI, updateUI } from './ui.js';
import { stepPhysics, updatePhysicsPositions, recreatePhysicsBody } from './physics.js';
import { onStop, provideRenderer as provideRendererToAction } from './actions.js';
import { createWorld } from './ecs/World.js';
import { addEntity } from './ecs/Entity.js';
import { defineComponent, addComponent } from './ecs/Component.js';
import { defineQuery } from './ecs/Query.js';

// --- Sample Data ---
const initialGameObjects = [
    {
        id: 1,
        name: 'Player',
        components: {
            transform: { position: { x: 0, y: 1 }, rotation: 0, scale: { x: 1, y: 1 } },
            sprite: { color: 0xff0000, shape: 'box' },
            rigidbody: { type: 'dynamic', enabled: true },
            collider: { shape: 'cuboid', density: 1.0, friction: 0.5 }
        }
    },
    {
        id: 2,
        name: 'Ground',
        components: {
            transform: { position: { x: 0, y: -2 }, rotation: 0, scale: { x: 5, y: 0.5 } },
            sprite: { color: 0x00ff00, shape: 'box' },
            rigidbody: { type: 'fixed', enabled: true },
            collider: { shape: 'cuboid' }
        }
    },
    {
        id: 3,
        name: 'Obstacle',
        components: {
            transform: { position: { x: 3, y: -1 }, rotation: 0, scale: { x: 0.5, y: 0.5 } },
            sprite: { color: 0x0000ff, shape: 'circle' },
            rigidbody: { type: 'dynamic', enabled: true },
            collider: { shape: 'ball', density: 1.0, friction: 0.5 }
        }
    }
];

// --- ECS Setup ---
const world = createWorld();

const Types = {
    f32: 'f32',
    ui8: 'ui8'
};

const Position = defineComponent({ x: Types.f32, y: Types.f32 });
const Velocity = defineComponent({ x: Types.f32, y: Types.f32 });
const Sprite = defineComponent({ color: Types.f32, shape: Types.ui8 }); // shape: 0 for box, 1 for circle
const RigidBody = defineComponent({ type: Types.ui8, enabled: Types.ui8 }); // type: 0 dynamic, 1 fixed, 2 kinematic
const Collider = defineComponent({ shape: Types.ui8, density: Types.f32, friction: Types.f32 });

// --- Global state ---
let phaserRenderer;

// --- Initialization ---
async function init() {
    await RAPIER.init();
    
    initState(initialGameObjects);
    
    setupSceneRenderer();
    
    initUI(phaserRenderer);
    provideRendererToAction(phaserRenderer);
    
    onStop(); // To initialize scene correctly

    requestAnimationFrame(gameLoop);
}

// --- Scene Rendering ---
function setupSceneRenderer() {
    const canvasContainer = document.getElementById('scene-canvas-container');
    phaserRenderer = new PhaserRenderer(canvasContainer, {
        onManipulate: (obj, phase) => {
            const scene = getActiveScene();
            if(!scene) return;
            
            phaserRenderer.updateObject(obj, phase === 'end');
            updatePhysicsPositions(obj);
            
            if (obj.id === scene.selectedObjectId) {
                updateUI();
            }
            
            if (phase === 'end') {
                recreatePhysicsBody(obj.id);
            }
            
            if (scene.simulationState === 'stopped') {
                scene.editorGameObjects = JSON.parse(JSON.stringify(scene.gameObjects));
            }
        },
        isEditingEnabled: () => {
            const scene = getActiveScene();
            return scene ? scene.simulationState === 'stopped' : false;
        }
    });
}

// --- Game Loop ---
function gameLoop(time) {
    const scene = getActiveScene();
    if (!scene) {
        requestAnimationFrame(gameLoop);
        return;
    }

    if (scene.simulationState === 'playing') {
        // Run script updates
        for (const [id, instances] of scene.scriptInstances.entries()) {
            const gameObject = getGameObjectById(id);
            if (gameObject) {
                for (const instance of instances) {
                    if (typeof instance.onUpdate === 'function') {
                        instance.onUpdate(gameObject);
                    }
                }
            }
        }

        // After all scripts have run, update physics bodies and renderer from game objects
        for (const obj of getGameObjects()) {
             // For kinematic bodies controlled by scripts or initial positions of dynamic bodies
            updatePhysicsPositions(obj); 
            // Update renderer for visual changes not driven by physics simulation
            phaserRenderer.updateObject(obj);
        }

        stepPhysics();

        // Update game objects from physics world
        for (const obj of getGameObjects()) {
            const body = getPhysicsBody(obj.id);
            if (body && isDynamicBody(body)) {
                const pos = body.translation();
                const rot = body.rotation();
                obj.components.transform.position.x = pos.x;
                obj.components.transform.position.y = pos.y;
                obj.components.transform.rotation = rot;
                phaserRenderer.updateObject(obj);
            }
        }
    }
    requestAnimationFrame(gameLoop);
}

// --- Start ---
init();