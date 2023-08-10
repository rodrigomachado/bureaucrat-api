import { toCamelCase } from "./strings"

/**
 * Converts all the keys of an object to CamelCase.
 */
export function toCamelCaseFields(obj: any): any {
  return Object.keys(obj).reduce((acc, key) => {
    acc[toCamelCase(key)] = obj[key]
    return acc
  }, {} as any)
}
