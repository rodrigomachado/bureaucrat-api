import { GraphQLEnumType, GraphQLEnumValueConfigMap } from 'graphql'

export function newGraphQLEnumType(
  name: string,
  description: string,
  values: string[],
): GraphQLEnumType {
  const valuesObj: GraphQLEnumValueConfigMap = {}
  for (const value of values) valuesObj[value] = { value }

  return new GraphQLEnumType({
    name, description, values: valuesObj,
  })
}
