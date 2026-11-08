export function countPhrase(count: number, one: string, many: string, none?: string) {
  const template = count === 1 ? one : count === 0 && none ? none : many;
  return template.replaceAll("{count}", String(count));
}
