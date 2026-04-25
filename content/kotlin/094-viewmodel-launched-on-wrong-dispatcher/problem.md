---
slug: viewmodel-launched-on-wrong-dispatcher
track: kotlin
orderIndex: 94
title: ViewModel IO Work on Main Thread
difficulty: medium
tags:
  - android
  - coroutines
  - performance
language: kotlin
---

## Context

This is `UserProfileViewModel.kt` in an Android social app. When the profile screen opens, the ViewModel loads a large user profile including their post history from a local Room database. The result is displayed in a `RecyclerView`. The function uses `viewModelScope` so work is tied to the ViewModel lifecycle.

Users on mid-range Android devices report the UI freezing for 2-4 seconds when opening a profile with many posts. The ANR dialog occasionally appears. Profiler traces show the main thread blocked in database query execution. On fast phones with SSDs the freeze is less noticeable, masking the issue in developer testing.

The team confirmed the Room DAO is correctly annotated with `suspend` and the query itself is optimized with proper indexes. The problem is in how the coroutine is launched.

## Buggy code

```kotlin
import androidx.lifecycle.*
import kotlinx.coroutines.*

data class UserProfile(val id: String, val name: String, val posts: List<String>)

class UserProfileViewModel(
    private val userRepository: UserRepository
) : ViewModel() {

    private val _profile = MutableLiveData<UserProfile>()
    val profile: LiveData<UserProfile> = _profile

    fun loadProfile(userId: String) {
        viewModelScope.launch(Dispatchers.Main) {
            val profile = userRepository.getProfile(userId)
            _profile.value = profile
        }
    }
}

interface UserRepository {
    suspend fun getProfile(userId: String): UserProfile
}
```
