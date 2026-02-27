#!/bin/bash

# Discord.js v14 Migration Script

echo "🔄 Starting Discord.js v14 migration..."

# 1. Fix imports - MessageEmbed to EmbedBuilder
echo "📦 Fixing MessageEmbed imports..."
find src -name "*.ts" -type f | while read file; do
  if grep -q "MessageEmbed" "$file"; then
    # Remove MessageEmbed from existing imports
    sed -i 's/, MessageEmbed//g' "$file"
    # Add EmbedBuilder import if not already present
    if ! grep -q "EmbedBuilder" "$file"; then
      sed -i "1s/^/import { EmbedBuilder } from '@discordjs\/builders';\n/" "$file"
    fi
  fi
done

# 2. Fix all MessageEmbed() to EmbedBuilder()
echo "🎯 Replacing MessageEmbed() with EmbedBuilder()..."
find src -name "*.ts" -type f -exec sed -i 's/new MessageEmbed()/new EmbedBuilder()/g' {} +

# 3. Fix color format from hex strings to numbers
echo "🎨 Fixing color formats..."
find src -name "*.ts" -type f | while read file; do
  sed -i -E "s/\.setColor\('(#[0-9a-fA-F]{6})'\)/\.setColor($(printf '0x%s' "${1#'#'}"))/g" "$file"
done

# More direct approach for color
find src -name "*.ts" -type f -exec sed -i "s/.setColor('#00ff00')/.setColor(0x00ff00)/g" {} +
find src -name "*.ts" -type f -exec sed -i "s/.setColor('#ff0000')/.setColor(0xff0000)/g" {} +
find src -name "*.ts" -type f -exec sed -i "s/.setColor('#0099ff')/.setColor(0x0099ff)/g" {} +
find src -name "*.ts" -type f -exec sed -i "s/.setColor('#cccccc')/.setColor(0xcccccc)/g" {} +
find src -name "*.ts" -type f -exec sed -i "s/.setColor('#ffff00')/.setColor(0xffff00)/g" {} +

# 4. Replace .addField with .addFields 
# This is manually done per-file due to complexity

echo "✅ Migration script completed!"
echo "⚠️  Note: Manual review needed for .addField() to .addFields() conversion"
echo "⚠️  Note: Manual review needed for .options methods on CommandInteraction"
