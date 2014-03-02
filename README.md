# Atom-jshint

A [package](http://atom.io/packages/atom-jshint) for [Atom](https://atom.io).

Validates your JS files against [JSHint](http://jshint.com) on save and as you type.

Installation
===

`apm install atom-jshint`

Or through the `cmd+shift+p` menu in Atom itself.

Usage
===

This package will run against your currently open file as you type and when you save.

Included features
===
 * Supports jshintConfig in package.json
 * Supports custom .jshintrc file in project root
 * Line number turns red when error on that line
 * Once you move your cursor to a line with an error, it will show in the status bar.
 * Configure how you want JSHint to run.

![Status on line](http://cl.ly/image/000i1Z2c2g3j/Image%202014-03-02%20at%208.41.18%20am.png)

Features not yet implemented
===

  * Output in a nicer way
  * Hover over line number to see applicable error
