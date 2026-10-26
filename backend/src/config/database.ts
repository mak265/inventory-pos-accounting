import mongoose from 'mongoose'

const MAX_RETRIES = 5
const RETRY_DELAY = 5000 // 5 seconds

export const connectDatabase = async (retryCount = 0): Promise<void> => {
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/inventory-pos'
  try {
    await mongoose.connect(MONGODB_URI, {
      maxPoolSize: 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    })

    console.log('MongoDB connected successfully')
    console.log(`Database: ${mongoose.connection.name}`)

    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err)
    })

    mongoose.connection.on('disconnected', () => {
      console.warn('MongoDB disconnected. Attempting to reconnect...')
    })

    mongoose.connection.on('reconnected', () => {
      console.log('MongoDB reconnected')
    })
  } catch (error) {
    console.error('MongoDB connection failed:', error)

    if (retryCount < MAX_RETRIES) {
      console.log(
        `Retrying connection in ${RETRY_DELAY / 1000}s... (Attempt ${retryCount + 1}/${MAX_RETRIES})`
      )
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY))
      return connectDatabase(retryCount + 1)
    } else {
      console.error('Max retries reached. Could not connect to MongoDB.')
      process.exit(1)
    }
  }
}

export const disconnectDatabase = async (): Promise<void> => {
  try {
    await mongoose.disconnect()
    console.log('MongoDB disconnected')
  } catch (error) {
    console.error('Error disconnecting from MongoDB:', error)
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  await disconnectDatabase()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  await disconnectDatabase()
  process.exit(0)
})
