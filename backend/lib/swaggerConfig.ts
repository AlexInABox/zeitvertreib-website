import swaggerJsdoc from 'swagger-jsdoc';

const options = {
    definition: {
        openapi: "3.0.0",
        info: {
            title: "API Documentation",
            version: "1.0.0",
        },
        servers: [
            {
                url: "https://bcnd.toolify.m1productions.de", // For production
                description: "Production server"
            },
            {
                url: "http://127.0.0.1:3000", // For development
                description: "Development server"
            },
        ]
    },
    apis: ["dist/lib/swaggerDocs.js"], // Adjust path if needed
};

const swaggerSpec = swaggerJsdoc(options);
export default swaggerSpec;