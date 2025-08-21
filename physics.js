import RAPIER from '@dimforge/rapier2d-compat';
import { getActiveScene, getGameObjects, getGameObjectById, setPhysicsBody, deletePhysicsBody as deletePhysicsBodyFromState, getPhysicsBody } from './state.js';
import { logToConsole } from './ui.js';

export function setupPhysics() {
    const scene = getActiveScene();
    if (!scene) return;
    
    let gravity = { x: 0.0, y: -9.81 };
    scene.world = new RAPIER.World(gravity);
    scene.physicsBodies.clear();

    getGameObjects().forEach(obj => {
        createPhysicsBody(obj);
    });
    logToConsole(`Physics world created for ${scene.name}.`);
}

function createPhysicsBody(obj) {
    const scene = getActiveScene();
    if (!scene || !obj.components.rigidbody || !obj.components.rigidbody.enabled || !obj.components.collider) return;

    const { transform, rigidbody, collider } = obj.components;
    const { position, rotation, scale } = transform;

    let bodyDesc;
    if (rigidbody.type === 'dynamic') bodyDesc = RAPIER.RigidBodyDesc.dynamic();
    else if (rigidbody.type === 'fixed') bodyDesc = RAPIER.RigidBodyDesc.fixed();
    else bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased();
    
    bodyDesc.setTranslation(position.x, position.y);
    bodyDesc.setRotation(rotation);
    const body = scene.world.createRigidBody(bodyDesc);

    let colliderDesc;
    if (collider.shape === 'cuboid') colliderDesc = RAPIER.ColliderDesc.cuboid(scale.x / 2, scale.y / 2);
    else if (collider.shape === 'ball') colliderDesc = RAPIER.ColliderDesc.ball((scale.x + scale.y) / 4);

    if (colliderDesc) {
        colliderDesc.setDensity(collider.density ?? 1.0);
        colliderDesc.setFriction(collider.friction ?? 0.5);
        scene.world.createCollider(colliderDesc, body);
    }
    setPhysicsBody(obj.id, body);
}

export function deletePhysicsBody(id) {
    const scene = getActiveScene();
    if (!scene) return;
    const body = getPhysicsBody(id);
    if (body) {
        scene.world.removeRigidBody(body);
        deletePhysicsBodyFromState(id);
    }
}

export function recreatePhysicsBody(id) {
    const scene = getActiveScene();
    if (!scene) return;
    const body = getPhysicsBody(id);
    if (body) {
        scene.world.removeRigidBody(body);
        deletePhysicsBodyFromState(id);
    }
    const obj = getGameObjectById(id);
    if (obj) {
        createPhysicsBody(obj);
    }
}

export function stepPhysics() {
    const scene = getActiveScene();
    if (scene && scene.world) {
        scene.world.step();
    }
}

export function updatePhysicsPositions(gameObject) {
    const body = getPhysicsBody(gameObject.id);
    if (body) {
        const { position, rotation } = gameObject.components.transform;
        body.setTranslation({ x: position.x, y: position.y }, true);
        body.setRotation(rotation, true);
    }
}