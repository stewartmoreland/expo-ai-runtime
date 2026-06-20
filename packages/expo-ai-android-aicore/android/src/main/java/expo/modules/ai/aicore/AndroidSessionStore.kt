package expo.modules.ai.aicore

import java.util.UUID

/**
 * Emulated sessions for the stateless Prompt API: the transcript is replayed as
 * a prompt prefix (docs/prd.md §8). Thread-safety is provided by synchronizing
 * on the store, since native calls may arrive from coroutine dispatchers.
 */
class AndroidSessionStore {
  private data class Turn(val role: String, val content: String)

  private val histories = mutableMapOf<String, MutableList<Turn>>()
  private val instructions = mutableMapOf<String, String?>()
  private val lock = Any()

  fun create(instr: String?): String {
    val id = UUID.randomUUID().toString()
    synchronized(lock) {
      histories[id] = mutableListOf()
      instructions[id] = instr
    }
    return id
  }

  /** Build native options whose prompt embeds the transcript so far. */
  fun composeOptions(sessionId: String, options: Map<String, Any?>): Map<String, Any?> {
    val prompt = options["prompt"] as? String ?: ""
    val builder = StringBuilder()
    synchronized(lock) {
      histories[sessionId]?.forEach { turn ->
        builder.append(if (turn.role == "user") "User: " else "Assistant: ")
          .append(turn.content)
          .append("\n")
      }
    }
    builder.append("User: ").append(prompt).append("\nAssistant:")

    val merged = HashMap(options)
    merged["prompt"] = builder.toString()
    synchronized(lock) {
      instructions[sessionId]?.let { merged["instructions"] = it }
    }
    return merged
  }

  fun commit(sessionId: String, userPrompt: String, assistantText: String) {
    synchronized(lock) {
      val history = histories.getOrPut(sessionId) { mutableListOf() }
      history.add(Turn("user", userPrompt))
      history.add(Turn("assistant", assistantText))
    }
  }

  fun reset(sessionId: String) {
    synchronized(lock) { histories[sessionId]?.clear() }
  }

  fun dispose(sessionId: String) {
    synchronized(lock) {
      histories.remove(sessionId)
      instructions.remove(sessionId)
    }
  }
}
