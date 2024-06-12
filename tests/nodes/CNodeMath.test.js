// test/nodes/CNodeMath.test.js
import { CNodeMath } from '../../src/nodes/CNodeMath.js';
import { CNodeConstant } from '../../src/nodes/CNode.js';
import { NodeMan } from '../../src/Globals.js';

describe('CNodeMath Integration Tests', () => {
    let nodeA, nodeB, cNodeMath;

    beforeEach(() => {
        // Clear NodeMan and add the nodes manually
        NodeMan.clear();  // Assuming you have a method to clear NodeMan

        // Create and register actual nodes
        nodeA = new CNodeConstant({ id: 'nodeA', value: 5 });
        nodeB = new CNodeConstant({ id: 'nodeB', value: 17 });

        NodeMan.add(nodeA); // Assuming you have a method to add nodes
        NodeMan.add(nodeB);
    });

    test('should calculate value correctly based on math expression', () => {
        cNodeMath = new CNodeMath({
            id: 'test2',
            math: `X = $nodeA;
                   // comment line
                   Y = X + $nodeB + 100; // something
                   Z = X + Y;
                   Z * 100;
                  `,
        });

        const result = cNodeMath.getValueFrame(0);
        expect(result).toBe(12700); // Calculated as: (5 + (5 + 17 + 100) + (5 + 17 + 100)) * 100 = 12700
    });

    test('should handle complex nested expressions', () => {
        cNodeMath = new CNodeMath({
            id: 'test3',
            math: `A = $nodeA * 2;
                   B = $nodeB / 2;
                   C = A + B;
                   C * 10;
                  `,
        });

        const result = cNodeMath.getValueFrame(0);
        expect(result).toBe(145); // Calculated as: ((5 * 2) + (17 / 2)) * 10 = 145
    });

    test('should handle no-op and comments correctly', () => {
        cNodeMath = new CNodeMath({
            id: 'test4',
            math: `X = $nodeA; 
                   Y = $nodeB; 
                   // Z = X + Y;
                   X * Y;
                  `,
        });

        const result = cNodeMath.getValueFrame(0);
        expect(result).toBe(85); // Calculated as: 5 * 17 = 85
    });

    test('should handle empty or invalid math expressions gracefully', () => {
        cNodeMath = new CNodeMath({
            id: 'test5',
            math: ``,
        });

        const result = cNodeMath.getValueFrame(0);
        expect(result).toBeUndefined(); // No valid expression to evaluate

        cNodeMath = new CNodeMath({
            id: 'test6',
            math: `invalid syntax`,
        });

        expect(() => cNodeMath.getValueFrame(0)).toThrow(); // Invalid expression should throw an error
    });
});
