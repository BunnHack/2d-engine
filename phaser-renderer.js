import * as Phaser from 'phaser';
import { getGameObjects, getSelectedObjectId, getCurrentTool, setSelectedObjectId } from './state.js';
import { onManipulateObject } from './actions.js';
import { updateUI } from './ui.js';

class EditorScene extends Phaser.Scene {
    constructor() {
        super({ key: 'EditorScene' });
        this.objectMap = new Map();
        this.selectionBox = null;
        this.rendererInstance = null;
        this.dragState = null;
        this.gizmo = null;
        this.isPanning = false;
        this.panStartX = 0;
        this.panStartY = 0;
    }

    create() {
        this.cameras.main.setBackgroundColor('#3a404c');
        this.cameras.main.centerOn(0, 0);

        this.input.on('pointerdown', (pointer) => this.onPointerDown(pointer));
        this.input.on('pointermove', (pointer) => this.onPointerMove(pointer));
        this.input.on('pointerup', (pointer) => this.onPointerUp(pointer));
        this.input.on('wheel', (pointer, gameObjects, deltaX, deltaY, deltaZ) => this.onWheel(deltaY));

        this.input.dragDistanceThreshold = 5;
    }

    onWheel(deltaY) {
        if (!this.rendererInstance || !this.rendererInstance.isEditingEnabled?.()) return;

        const zoomFactor = 0.001;
        let newZoom = this.cameras.main.zoom - deltaY * zoomFactor;
        newZoom = Phaser.Math.Clamp(newZoom, 0.2, 5);
        this.cameras.main.zoomTo(newZoom, 100);
    }

    createObject(objData) {
        const { transform, sprite } = objData.components;
        const { position, scale, rotation } = transform;

        let gameObject;
        const width = Math.abs(scale.x * 100); // Base size factor
        const height = Math.abs(scale.y * 100);

        if (sprite.shape === 'circle') {
            // Phaser circles are drawn from center, radius is based on average of width/height
            const radius = (width + height) / 4;
            gameObject = this.add.circle(position.x * 100, -position.y * 100, radius, sprite.color);
        } else { // 'box'
            gameObject = this.add.rectangle(position.x * 100, -position.y * 100, width, height, sprite.color);
        }
        
        gameObject.rotation = -rotation; // Y-axis is inverted
        gameObject.setData('id', objData.id);
        this.objectMap.set(objData.id, gameObject);
        gameObject.setInteractive();
    }

    removeObject(id) {
        const gameObject = this.objectMap.get(id);
        if (gameObject) {
            gameObject.destroy();
            this.objectMap.delete(id);
        }
        if (this.rendererInstance && this.rendererInstance.selectedId === id) {
            this.setSelected(null);
        }
    }

    updateObject(objData, forceRedraw = false) {
        let gameObject = this.objectMap.get(objData.id);

        if (forceRedraw) {
            if(gameObject) gameObject.destroy();
            this.createObject(objData);
            gameObject = this.objectMap.get(objData.id);
        }

        if (!gameObject) return;
        
        const { transform, sprite } = objData.components;
        const { position, scale, rotation } = transform;
        
        gameObject.setPosition(position.x * 100, -position.y * 100);
        gameObject.rotation = -rotation; // Y-axis is inverted for rendering
        
        if (gameObject.setFillStyle) {
            gameObject.setFillStyle(sprite.color);
        }

        if (gameObject.type === 'Rectangle') {
            gameObject.setSize(Math.abs(scale.x * 100), Math.abs(scale.y * 100));
        } else if (gameObject.type === 'Arc') { // Circle is an Arc
            const radius = (Math.abs(scale.x * 100) + Math.abs(scale.y * 100)) / 4;
            gameObject.setRadius(radius);
        }

        // Force selection box update
        if (this.rendererInstance && this.rendererInstance.selectedId === objData.id) {
            this.setSelected(objData.id);
        }
    }

    setSelected(id) {
        if (this.selectionBox) {
            this.selectionBox.destroy();
            this.selectionBox = null;
        }

        const gameObject = this.objectMap.get(id);
        if (gameObject) {
            const bounds = gameObject.getBounds();
            this.selectionBox = this.add.graphics();
            this.selectionBox.lineStyle(2, 0x0099ff, 1);
            this.selectionBox.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
        }
        this.updateGizmo();
    }

    setObjects(gameObjects) {
        this.objectMap.forEach(obj => obj.destroy());
        this.objectMap.clear();
        gameObjects.forEach(objData => this.createObject(objData));
    }
    
    update(time, delta) {
        if (this.selectionBox) {
            const selectedId = Array.from(this.objectMap.entries()).find(([id, go]) => {
                return this.selectionBox && go.getBounds().x === this.selectionBox.x;
            });
            const gameObject = this.objectMap.get(getSelectedObjectId());
            if(gameObject) {
                const bounds = gameObject.getBounds();
                this.selectionBox.clear();
                this.selectionBox.lineStyle(2, 0x0099ff, 1);
                this.selectionBox.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
            } else {
                 this.selectionBox.destroy();
                 this.selectionBox = null;
            }
        }
        this.updateGizmo(true);
    }

    onPointerDown(pointer) {
        if (!this.rendererInstance || !this.rendererInstance.isEditingEnabled?.()) return;
        
        const tool = getCurrentTool();
        const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        const clickedObjects = this.input.manager.hitTest(pointer, Array.from(this.objectMap.values()), this.cameras.main);
        
        if (tool === 'select') {
            if (clickedObjects.length > 0) {
                const topObject = clickedObjects[0];
                const id = topObject.getData('id');
                setSelectedObjectId(id);
                this.rendererInstance.selectedId = id;
                this.setSelected(id);
                updateUI();
            } else {
                this.isPanning = true;
                this.panStartX = pointer.x;
                this.panStartY = pointer.y;
            }
            return;
        }

        const id = getSelectedObjectId();
        if (!id) return;
        const go = this.objectMap.get(id);
        if (!go) return;
        const b = go.getBounds();
        let axis = null;
        
        const hit = this._hitGizmo(worldPoint, b, tool);
        if (hit) {
            axis = hit.axis || null;
        } else if (Phaser.Geom.Rectangle.Contains(b, worldPoint.x, worldPoint.y)) {
            // allows dragging the object from its body with move tool
        } else {
            return;
        }

        const obj = getGameObjects().find(o => o.id === id);
        if (!obj) return;
        const start = { x: worldPoint.x, y: worldPoint.y };
        const center = { x: obj.components.transform.position.x * 100, y: -obj.components.transform.position.y * 100 };
        this.dragState = {
            tool, id, start,
            objStart: JSON.parse(JSON.stringify(obj.components.transform)),
            center, axis
        };
    }

    onPointerMove(pointer) {
        if (this.isPanning && getCurrentTool() === 'select' && pointer.isDown) {
            const dx = pointer.x - this.panStartX;
            const dy = pointer.y - this.panStartY;
            this.cameras.main.scrollX -= dx / this.cameras.main.zoom;
            this.cameras.main.scrollY -= dy / this.cameras.main.zoom;
            this.panStartX = pointer.x;
            this.panStartY = pointer.y;
            return; // Don't process object dragging if panning
        }

        if (!this.dragState) return;
        const ds = this.dragState;
        const obj = getGameObjects().find(o => o.id === ds.id);
        if (!obj) return;
        const tr = obj.components.transform;
        
        const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);

        if (ds.tool === 'move') {
            let dx = (worldPoint.x - ds.start.x) / 100;
            let dy = -(worldPoint.y - ds.start.y) / 100;
            if (ds.axis === 'x') dy = 0;
            if (ds.axis === 'y') dx = 0;
            tr.position.x = ds.objStart.position.x + dx;
            tr.position.y = ds.objStart.position.y + dy;
        } else if (ds.tool === 'rotate') {
            const ang = Phaser.Math.Angle.Between(ds.center.x, ds.center.y, worldPoint.x, worldPoint.y);
            tr.rotation = -ang;
        } else if (ds.tool === 'scale') {
            const d0 = Math.hypot(ds.start.x - ds.center.x, ds.start.y - ds.center.y) || 1;
            const d1 = Math.hypot(worldPoint.x - ds.center.x, worldPoint.y - ds.center.y);
            const r = Math.max(0.05, d1 / d0);
            if (ds.axis === 'x') {
                tr.scale.x = Math.sign(ds.objStart.scale.x) * Math.max(0.05, Math.abs(ds.objStart.scale.x) * r);
                tr.scale.y = ds.objStart.scale.y;
            } else if (ds.axis === 'y') {
                tr.scale.y = Math.sign(ds.objStart.scale.y) * Math.max(0.05, Math.abs(ds.objStart.scale.y) * r);
                tr.scale.x = ds.objStart.scale.x;
            } else {
                tr.scale.x = Math.sign(ds.objStart.scale.x) * Math.max(0.05, Math.abs(ds.objStart.scale.x) * r);
                tr.scale.y = Math.sign(ds.objStart.scale.y) * Math.max(0.05, Math.abs(ds.objStart.scale.y) * r);
            }
        }
        this.rendererInstance.onManipulate?.(obj, 'drag');
        this.updateObject(obj);
    }

    onPointerUp() {
        if (this.isPanning) {
            this.isPanning = false;
        }
        
        if (!this.dragState) return;
        const obj = getGameObjects().find(o => o.id === this.dragState.id);
        if (obj) this.rendererInstance.onManipulate?.(obj, 'end');
        this.dragState = null;
    }

    updateGizmo(lazy = false) {
        const id = getSelectedObjectId();
        const tool = getCurrentTool();
        const go = id ? this.objectMap.get(id) : null;
        if (!go) { this.gizmo?.destroy(); this.gizmo = null; return; }
        if (lazy && this.gizmo && this.gizmo.activeTool === tool) {
            const b = go.getBounds(); this.gizmo.setPosition(0,0); this.gizmo.clear(); this._drawGizmoShapes(this.gizmo, b, tool); return;
        }
        this.gizmo?.destroy(); this.gizmo = this.add.graphics(); this.gizmo.activeTool = tool; const b = go.getBounds(); this._drawGizmoShapes(this.gizmo, b, tool);
    }

    _drawGizmoShapes(g, bounds, tool) {
        const cx = bounds.centerX, cy = bounds.centerY; const len = Math.max(40, Math.min(bounds.width, bounds.height));
        if (tool === 'move') {
            // X axis (red)
            g.lineStyle(2, 0xff5555, 1).beginPath();
            g.moveTo(cx, cy); g.lineTo(cx + len, cy); g.strokePath();
            g.fillStyle(0xff5555, 1); g.fillTriangle(cx + len, cy, cx + len - 8, cy - 5, cx + len - 8, cy + 5);
            // Y axis (green)
            g.lineStyle(2, 0x55ff55, 1).beginPath();
            g.moveTo(cx, cy); g.lineTo(cx, cy - len); g.strokePath();
            g.fillStyle(0x55ff55, 1); g.fillTriangle(cx, cy - len, cx - 5, cy - len + 8, cx + 5, cy - len + 8);
        } else if (tool === 'scale') {
            // Lines with square handles
            g.lineStyle(2, 0xffc107, 1).beginPath(); g.moveTo(cx, cy); g.lineTo(cx + len, cy); g.strokePath();
            g.lineStyle(2, 0x00e676, 1).beginPath(); g.moveTo(cx, cy); g.lineTo(cx, cy - len); g.strokePath();
            const s = 6;
            g.fillStyle(0xffc107, 1); g.fillRect(cx + len - s, cy - s, s * 2, s * 2);
            g.fillStyle(0x00e676, 1); g.fillRect(cx - s, cy - len - s, s * 2, s * 2);
        } else if (tool === 'rotate') {
            const r = Math.max(bounds.width, bounds.height) * 0.75;
            g.lineStyle(2, 0x61afef, 1).strokeCircle(cx, cy, r);
            g.fillStyle(0x61afef, 1); g.fillCircle(cx + r, cy, 3);
        }
    }

    _hitGizmo(worldPoint, bounds, tool) {
        const cx = bounds.centerX, cy = bounds.centerY;
        const px = worldPoint.x, py = worldPoint.y;
        if (tool === 'move') {
            const len = Math.max(40, Math.min(bounds.width, bounds.height));
            if (Math.abs(py - cy) <= 8 && px >= cx && px <= cx + len) return { tool, axis: 'x' };
            if (Math.abs(px - cx) <= 8 && py <= cy && py >= cy - len) return { tool, axis: 'y' };
        } else if (tool === 'scale') {
            const len = Math.max(40, Math.min(bounds.width, bounds.height));
            const s = 8;
            if (px >= cx + len - s && px <= cx + len + s && py >= cy - s && py <= cy + s) return { tool, axis: 'x' };
            if (px >= cx - s && px <= cx + s && py >= cy - len - s && py <= cy - len + s) return { tool, axis: 'y' };
        }
        if (tool === 'rotate') {
            const r = Math.max(bounds.width, bounds.height) * 0.75;
            const d = Math.hypot(px - cx, py - cy);
            if (Math.abs(d - r) <= 8) return { tool };
        }
        return null;
    }
}

export class PhaserRenderer {
    constructor(container, options = {}) {
        this.container = container;
        this.gameObjects = [];
        this.selectedId = null;
        this.scene = null;

        const config = {
            type: Phaser.AUTO,
            parent: this.container,
            width: this.container.clientWidth,
            height: this.container.clientHeight,
            scene: EditorScene,
            backgroundColor: '#3a404c',
        };

        this.game = new Phaser.Game(config);
        
        this.game.events.on('ready', () => {
            this.scene = this.game.scene.getScene('EditorScene');
            this.scene.rendererInstance = this;
            this.onSceneReady(); // Scene is ready and renderer has a reference.
        });

        window.addEventListener('resize', this.onWindowResize.bind(this));
        
        this.onManipulate = options.onManipulate;
        this.isEditingEnabled = options.isEditingEnabled;
    }

    onSceneReady() {
        const gameObjects = getGameObjects();
        if (gameObjects.length > 0 && this.scene) {
            this.setObjects(gameObjects);
        }
    }

    setObjects(gameObjects) {
        this.gameObjects = gameObjects;
        if (this.scene) {
            this.scene.setObjects(gameObjects);
        }
    }

    removeObject(id) {
        if (this.scene) {
            this.scene.removeObject(id);
        }
    }

    updateObject(objData) {
        if (this.scene) {
            this.scene.updateObject(objData);
        }
    }

    setSelected(id) {
        this.selectedId = id;
        if (this.scene) {
            this.scene.setSelected(id);
        }
    }

    get currentTool() {
        return getCurrentTool();
    }

    setTool(tool) {
        if (this.scene) {
            this.scene.updateGizmo();
        }
    }

    onWindowResize() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        this.game.scale.resize(width, height);
    }
}