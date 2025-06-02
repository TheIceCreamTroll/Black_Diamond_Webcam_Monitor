import type { WebcamImage } from '../types'

export function calculateMissingImageTimestamps(displayImages: WebcamImage[]): { timestamp: number; date: Date }[] {
  if (displayImages.length < 2) return []
  
  const missingTimes: { timestamp: number; date: Date }[] = []
  const images = [...displayImages].sort((a, b) => a.imageTimestamp - b.imageTimestamp)
  
  // Check for gaps between consecutive images
  for (let i = 0; i < images.length - 1; i++) {
    const currentTime = images[i].imageTimestamp
    const nextTime = images[i + 1].imageTimestamp
    const gap = nextTime - currentTime
    
    // If gap is more than 18 minutes (allowing 3 minute tolerance for 15-minute intervals)
    // This catches cases where an image should exist at the 15-minute mark
    if (gap > 1080) { // 18 minutes in seconds
      // Calculate expected timestamps at 15-minute intervals
      let expectedTime = currentTime + 900 // Add 15 minutes
      
      while (expectedTime < nextTime - 180) { // Stop 3 minutes before the next image
        missingTimes.push({
          timestamp: expectedTime,
          date: new Date(expectedTime * 1000)
        })
        expectedTime += 900 // Add another 15 minutes
      }
    }
  }
  
  // Sort by timestamp descending (newest first)
  missingTimes.sort((a, b) => b.timestamp - a.timestamp)
  
  return missingTimes
}

export function calculateImageStats(
  displayImages: WebcamImage[], 
  missingImageTimestamps: { timestamp: number; date: Date }[]
) {
  if (displayImages.length < 2) return null
  
  const actualMissing = missingImageTimestamps.length
  
  const totalExpected = displayImages.length + actualMissing
  
  return {
    expected: totalExpected,
    actual: displayImages.length,
    missing: actualMissing,
    coverage: ((displayImages.length / totalExpected) * 100).toFixed(1)
  }
}