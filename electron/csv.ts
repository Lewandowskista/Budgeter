import fs from 'node:fs'

export function readCsvFile(filePath: string) {
  return fs.readFileSync(filePath, 'utf8')
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let value = ''
  let inQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    const nextCharacter = text[index + 1]

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        value += '"'
        index += 1
        continue
      }

      inQuotes = !inQuotes
      continue
    }

    if (!inQuotes && character === ',') {
      row.push(value)
      value = ''
      continue
    }

    if (!inQuotes && (character === '\n' || character === '\r')) {
      if (character === '\r' && nextCharacter === '\n') {
        index += 1
      }

      row.push(value)
      value = ''

      if (row.some((cell) => cell.trim().length > 0)) {
        rows.push(row)
      }

      row = []
      continue
    }

    value += character
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value)
    if (row.some((cell) => cell.trim().length > 0)) {
      rows.push(row)
    }
  }

  return rows
}
