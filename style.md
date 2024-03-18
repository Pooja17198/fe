# Coding Style and Conventions

We follow [AOSP Java Code Style for Contributors](https://source.android.com/setup/contribute/code-style)
It is the closest fully specified guide to the style variations used at OCI.
Formatting highlights:

- Spaces not tabs
- Block level indent is 4 spaces
- Line wrap (continutation) indent is 8 spaces

Use `build_config/checkstyle.xml` to configure checkstyle appropriately.

Use `build_config/checkstyle-suppressions.xml` to suppress checking generated
sources.

Use [spotless-maven-plugin](https://github.com/diffplug/spotless/tree/master/plugin-maven) 
to format your code during the local maven build process.Include the
following in your project's `pom.xml` build plugins. See `pom.xml` for an example.

```
          <plugin>
            <groupId>com.diffplug.spotless</groupId>
            <artifactId>spotless-maven-plugin</artifactId>
            <version>1.27.0</version>
            <configuration>
              <java>
                <removeUnusedImports/>
                <googleJavaFormat>
                  <version>1.6</version>
                  <!-- Optional, available versions: GOOGLE, AOSP
                  https://github.com/google/google-java-format/blob/master/core/src/main/java/com/google/googlejavaformat/java/JavaFormatterOptions.java -->
                  <style>AOSP</style>
                </googleJavaFormat>
              </java>
            </configuration>
            <executions>
              <execution>
                <id>format-sources</id>
                <goals>
                  <goal>${formatter-goal}</goal>
                </goals>
                <phase>process-sources</phase>
              </execution>
            </executions>
          </plugin>
```

Use the [google-java-format](https://plugins.jetbrains.com/plugin/8527-google-java-format)
plugin to format your code in IntelliJ. Select the `Android Open Source Project
(AOSP) style` code style option.
