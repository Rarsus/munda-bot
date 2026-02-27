#!/bin/bash

# Fix addField to addFields
# This is more complex as we need to handle parameters properly

echo "🔧 Fixing addField to addFields..."

# Simple pattern: .addField('name', 'value') -> .addFields({name: 'name', value: 'value'})
# Complex pattern: .addField('name', 'value', true) -> .addFields({name: 'name', value: 'value', inline: true})

find src -name "*.ts" -type f | while read file; do
  # Replace .addField( with .addFields([{ on first occurrence, tracking state
  # This is simplified - doesn't handle all multi-line cases perfectly
  
  # For now, just warn and list files that need manual fixing
  if grep -q "\.addField(" "$file"; then
    echo "⚠️  $file needs .addField() -> .addFields() conversion"
  fi
done

echo "Done"
