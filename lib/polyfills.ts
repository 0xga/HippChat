// Import polyfills in the correct order
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';

// Set up Buffer polyfill
import { Buffer } from 'buffer';
global.Buffer = Buffer;

// Set up process polyfill
import process from 'process';
global.process = process;
