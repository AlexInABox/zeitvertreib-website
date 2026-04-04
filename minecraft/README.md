# Minecraft Plugins

> [!IMPORTANT]
> When creating a new plugin, add a folder here with a **short name that starts with an uppercase letter**. Uppercase is required for auto-compilation.

## Prerequisites

- Java 21 (tested with OpenJDK 21 & 25)

## Building

Run one of these commands to build **all plugins** in **this** directory:

```bash
./gradlew build
```

On Windows:

```bat
./gradlew.bat build
```

## Output

All plugin .jar files will be located in the **same** `output` folder.
