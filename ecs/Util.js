/**
 * Creates a new SparseSet data structure.
 * @returns {object} A new SparseSet instance.
 */
export function SparseSet() {
    const dense = [];
    const sparse = [];
    
    return {
        dense,
        sparse,
        has: (val) => {
            return sparse[val] < dense.length && dense[sparse[val]] === val;
        },
        add: (val) => {
            if (sparse[val] < dense.length && dense[sparse[val]] === val) {
                return;
            }
            sparse[val] = dense.length;
            dense.push(val);
        },
        remove: (val) => {
            if (!(sparse[val] < dense.length && dense[sparse[val]] === val)) {
                return;
            }
            const denseIndex = sparse[val];
            const lastVal = dense.pop();
            if (denseIndex < dense.length) {
                dense[denseIndex] = lastVal;
                sparse[lastVal] = denseIndex;
            }
        }
    };
}
