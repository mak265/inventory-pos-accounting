import mongoose from 'mongoose'

/**
 * Create database indexes for performance optimization
 * This should be called after all models are registered
 */
export const createIndexes = async (): Promise<void> => {
  try {
    console.log('Creating database indexes...')

    // Get all registered models
    const models = mongoose.modelNames()

    // Create indexes for each model
    for (const modelName of models) {
      const model = mongoose.model(modelName)
      await model.createIndexes()
      console.log(`Indexes created for ${modelName}`)
    }

    console.log('All indexes created successfully')
  } catch (error) {
    console.error('Error creating indexes:', error)
    throw error
  }
}

/**
 * List all indexes in the database
 */
export const listIndexes = async (): Promise<void> => {
  try {
    const models = mongoose.modelNames()

    for (const modelName of models) {
      const model = mongoose.model(modelName)
      const indexes = await model.collection.getIndexes()
      console.log(`\nIndexes for ${modelName}:`)
      console.log(JSON.stringify(indexes, null, 2))
    }
  } catch (error) {
    console.error('Error listing indexes:', error)
  }
}
