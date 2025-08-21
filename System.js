/**
 * Defines a new system function.
 *
 * @param {function} update The update function to create a system from. It receives the world and any other arguments.
 * @returns {function} A new system function that takes a world and arguments, runs the update, and returns the world.
 */
export const defineSystem = (update) => (world, ...args) => {
  update(world, ...args)
  return world
}

/**
 * Composes systems into a single pipeline.
 *
 * @param {...function} fns The systems to compose.
 * @returns {function} A new function that runs the systems in sequence.
 */
export const pipe = (...fns) => (world, ...args) => fns.reduce((v, f) => f(v, ...args), world);