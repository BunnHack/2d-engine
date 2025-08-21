import { $notQueries, $queries, queryAddEntity, queryCheckEntity, queryRemoveEntity } from './Query.js'
import { $localEntities, $localEntityLookup, $manualEntityRecycling, $size, resizeWorlds } from './World.js'

export const $entityMasks = Symbol('entityMasks')
export const $entityComponents = Symbol('entityComponents')
export const $entitySparseSet = Symbol('entitySparseSet')
export const $entityArray = Symbol('entityArray')
export const $entityIndices = Symbol('entityIndices')
export const $removedEntities = Symbol('removedEntities')

let defaultSize = 100000

// need a global EID cursor which all worlds and all components know about
// so that world entities can posess entire rows spanning all component tables
let globalEntityCursor = 0
let globalSize = defaultSize
let resizeThreshold = () => globalSize - (globalSize / 5)

export const getGlobalSize = () => globalSize

// removed eids should also be global to prevent memory leaks
const removed = []
const recycled = []

const defaultRemovedReuseThreshold = 0.01
let removedReuseThreshold = defaultRemovedReuseThreshold

/**
 * Resets global entity-related variables to their default states.
 */
export const resetGlobals = () => {
  globalSize = defaultSize
  globalEntityCursor = 0
  removedReuseThreshold = defaultRemovedReuseThreshold
  removed.length = 0
  recycled.length = 0
}

/**
 * Gets the default size for entities.
 * @returns {number} The default size.
 */
export const getDefaultSize = () => defaultSize

/**
 * Sets the default maximum number of entities for worlds and component stores.
 *
 * @param {number} newSize The new default size.
 */
export const setDefaultSize = newSize => { 
  const oldSize = globalSize

  defaultSize = newSize
  resetGlobals()

  globalSize = newSize
  resizeWorlds(newSize)
  resizeComponents(newSize)
  // setSerializationResized(true) // file doesn't exist so commented out
}

/**
 * Sets the threshold for recycling removed entity IDs.
 * This should be set to as a % (0-1) of `defaultSize` that you would never likely remove/add on a single frame.
 *
 * @param {number} newThreshold A value between 0 and 1.
 */
export const setRemovedRecycleThreshold = newThreshold => {
  removedReuseThreshold = newThreshold
}

/**
 * Gets the current entity cursor.
 * @returns {number} The global entity cursor.
 */
export const getEntityCursor = () => globalEntityCursor
/**
 * Gets a list of all removed entity IDs.
 * @returns {number[]} An array of removed entity IDs.
 */
export const getRemovedEntities = () => [...recycled, ...removed]

export const eidToWorld = new Map()

/**
 * Flushes recycled entities into the main removed pool.
 * Requires manual entity recycling to be enabled.
 * @param {object} world The world to flush for.
 */
export const flushRemovedEntities = (world) => {
  if (!world[$manualEntityRecycling]) {
    throw new Error("bitECS - cannot flush removed entities, enable feature with the enableManualEntityRecycling function")
  }
  removed.push(...recycled)
  recycled.length = 0
}

/**
 * Adds a new entity to the specified world.
 *
 * @param {object} world The world to add the entity to.
 * @returns {number} The new entity ID.
 */
export const addEntity = (world) => {

  const eid = world[$manualEntityRecycling]
    ? removed.length ? removed.shift() : globalEntityCursor++
    : removed.length > Math.round(globalSize * removedReuseThreshold) ? removed.shift() : globalEntityCursor++

  if (eid > world[$size]) throw new Error("bitECS - max entities reached")

  world[$entitySparseSet].add(eid)
  eidToWorld.set(eid, world)

  world[$notQueries].forEach(q => {
    const match = queryCheckEntity(world, q, eid)
    if (match) queryAddEntity(q, eid)
  })

  world[$entityComponents].set(eid, new Set())

  return eid
}

/**
 * Removes an existing entity from the specified world.
 *
 * @param {object} world The world to remove the entity from.
 * @param {number} eid The entity ID to remove.
 */
export const removeEntity = (world, eid) => {
  // Check if entity is already removed
  if (!world[$entitySparseSet].has(eid)) return

  // Remove entity from all queries
  // TODO: archetype graph
  world[$queries].forEach(q => {
    queryRemoveEntity(world, q, eid)
  })

  // Free the entity
  if (world[$manualEntityRecycling])
    recycled.push(eid)
  else
    removed.push(eid)

  // remove all eid state from world
  world[$entitySparseSet].remove(eid)
  world[$entityComponents].delete(eid)

  // remove from deserializer mapping
  world[$localEntities].delete(world[$localEntityLookup].get(eid))
  world[$localEntityLookup].delete(eid)

  // Clear entity bitmasks
  for (let i = 0; i < world[$entityMasks].length; i++) world[$entityMasks][i][eid] = 0
}

/**
 *  Returns an array of components that an entity possesses.
 *
 * @param {object} world The world to query.
 * @param {number} eid The entity ID.
 * @returns {object[]} An array of component stores.
 */
export const getEntityComponents = (world, eid) => {
  if (eid === undefined) throw new Error('bitECS - entity is undefined.')
  if (!world[$entitySparseSet].has(eid)) throw new Error('bitECS - entity does not exist in the world.')
  return Array.from(world[$entityComponents].get(eid))
}

/**
 * Checks if an entity exists in a world.
 * 
 * @param {object} world The world to check in.
 * @param {number} eid The entity ID to check for.
 * @returns {boolean} True if the entity exists, false otherwise.
 */
export const entityExists = (world, eid) => world[$entitySparseSet].has(eid)