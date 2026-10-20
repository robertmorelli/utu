package utu

import (
	"fmt"
	"os"
)

// utu:Console.log
func consoleLog(text string) { fmt.Fprintln(os.Stdout, text) }

// utu:Console.warn
func consoleWarn(text string) { fmt.Fprintln(os.Stderr, text) }

// utu:Console.error
func consoleError(text string) { fmt.Fprintln(os.Stderr, text) }
