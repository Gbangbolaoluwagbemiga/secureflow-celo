// This ensures the IDE stops reporting errors for standard HTML elements 
// when the local node_modules/@types/react is missing.

declare global {
    namespace JSX {
        interface IntrinsicElements {
            [elemName: string]: any;
        }
    }
}

// Ensure this is treated as a module
export { };
