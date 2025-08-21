import { $storeSize, createStore, resetStoreFor, resizeStore } from './Storage.js'
import { $queries, queryAddEntity, queryRemoveEntity, queryCheckEntity } from './Query.js'
import { $bitflag, $size } from './World.js'
import { $entityMasks, $entityComponents, getGlobalSize, $entitySparseSet } from './Entity.js'

export const $componentMap = Symbol('componentMap')

export const components = []

/**
 * Resizes all component stores.
 * @param {number} size The new size for the component stores.
 */
export const resizeComponents = (size) => {
  components.forEach(component => resizeStore(component, size))
}


/**
 * Defines a new component store.
 *
 * @param {object} [schema] The schema for the component properties.
 * @param {number} [size] The initial size of the component store.
 * @returns {object} The new component store.
 */
export const defineComponent = (schema, size) => {
  const component = createStore(schema, size || getGlobalSize())
  if (schema && Object.keys(schema).length) components.push(component)
  return component
}

/**
 * Increments the bitflag for the next component registration.
 * @param {object} world The world to increment the bitflag for.
 */
export const incrementBitflag = (world) => {
  world[$bitflag] *= 2
  if (world[$bitflag] >= 2**31) {
    world[$bitflag] = 1
    world[$entityMasks].push(new Uint32Array(world[$size]))
  }
}


/**
 * Registers a component with a world.
 *
 * @param {object} world The world to register the component with.
 * @param {object} component The component to register.
 */
export const registerComponent = (world, component) => {
  if (!component) throw new Error(`bitECS - Cannot register null or undefined component`)

  const queries = new Set()
  const notQueries = new Set()
  const changedQueries = new Set()

  world[$queries].forEach(q => {
    if (q.allComponents.includes(component)) {
      queries.add(q)
    }
  })

  world[$componentMap].set(component, { 
    generationId: world[$entityMasks].length - 1,
    bitflag: world[$bitflag],
    store: component,
    queries,
    notQueries,
    changedQueries,
  })

  incrementBitflag(world)
}

/**
 * Registers multiple components with a world.
 *
 * @param {object} world The world to register the components with.
 * @param {object[]} components An array of components to register.
 */
export const registerComponents = (world, components) => {
  components.forEach(c => registerComponent(world, c))
}

/**
 * Checks if an entity has a component.
 *
 * @param {object} world The world to check in.
 * @param {object} component The component to check for.
 * @param {number} eid The entity ID.
 * @returns {boolean} True if the entity has the component, otherwise false.
 */
export const hasComponent = (world, component, eid) => {
  const registeredComponent = world[$componentMap].get(component)
  if (!registeredComponent) return false
  const { generationId, bitflag } = registeredComponent
  const mask = world[$entityMasks][generationId][eid]
  return (mask & bitflag) === bitflag
}

/**
 * Adds a component to an entity.
 *
 * @param {object} world The world to operate on.
 * @param {object} component The component to add.
 * @param {number} eid The entity ID.
 * @param {boolean} [reset=false] Whether to reset the component's data upon adding.
 */
export const addComponent = (world, component, eid, reset=false) => {
  if (eid === undefined) throw new Error('bitECS - entity is undefined.')
  if (!world[$entitySparseSet].has(eid)) throw new Error('bitECS - entity does not exist in the world.')
  if (!world[$componentMap].has(component)) registerComponent(world, component)
  if (hasComponent(world, component, eid)) return

  const c = world[$componentMap].get(component)
  const { generationId, bitflag, queries, notQueries } = c
    
  // Add bitflag to entity bitmask
  world[$entityMasks][generationId][eid] |= bitflag

  // todo: archetype graph
  queries.forEach(q => {
    // remove this entity from toRemove if it exists in this query
    q.toRemove.remove(eid)
    const match = queryCheckEntity(world, q, eid)
    if (match) {
      q.exited.remove(eid)
      queryAddEntity(q, eid)
    }
    if (!match) {
      q.entered.remove(eid)
      queryRemoveEntity(world, q, eid)
    }
  })

  world[$entityComponents].get(eid).add(component)

  // Zero out each property value
  if (reset) resetStoreFor(component, eid)
}

/**
 * Removes a component from an entity and resets component state unless otherwise specified.
 *
 * @param {object} world The world to operate on.
 * @param {object} component The component to remove.
 * @param {number} eid The entity ID.
 * @param {boolean} [reset=true] Whether to reset the component's data upon removal.
 */
export const removeComponent = (world, component, eid, reset=true) => {
  if (eid === undefined) throw new Error('bitECS - entity is undefined.')
  if (!world[$entitySparseSet].has(eid)) throw new Error('bitECS - entity does not exist in the world.')
  if (!hasComponent(world, component, eid)) return

  const c = world[$componentMap].get(component)
  const { generationId, bitflag, queries } = c

  // Remove flag from entity bitmask
  world[$entityMasks][generationId][eid] &= ~bitflag
  
  // todo: archetype graph
  queries.forEach(q => {
    // remove this entity from toRemove if it exists in this query
    q.toRemove.remove(eid)
    const match = queryCheckEntity(world, q, eid)
    if (match) {
      q.exited.remove(eid)
      queryAddEntity(q, eid)
    }
    if (!match) {
      q.entered.remove(eid)
      queryRemoveEntity(world, q, eid)
    }
  })

  world[$entityComponents].get(eid).delete(component)

  // Zero out each property value
  if (reset) resetStoreFor(component, eid)
}