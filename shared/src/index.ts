/**
 * @nexuserp/shared - the contract boundary between the service and the web interface.
 *
 * This package deliberately contains NO database access, NO framework imports, and NO
 * domain logic. It exists so that one definition of the error envelope, the permission
 * vocabulary and the validation schemas is read by both sides rather than restated.
 *
 * Keeping it contract-only is what protects Constitution Principle VI: a shared package
 * carrying domain logic would become an invisible path around module boundaries, and one
 * exposing the database client would couple every module to it (research.md R-001).
 */

export * from './errors/index.js';
export * from './schemas/index.js';
export * from './permissions/index.js';