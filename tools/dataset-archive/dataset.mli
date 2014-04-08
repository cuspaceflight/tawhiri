open Core.Std

type 'a t

type ro
type rw
type 'a mode
val ro : ro mode
val rw : rw mode

val filename : Time.t -> string
val shape : int * int * int * int * int
val shape_arr : int array

val create : Time.t -> 'a mode -> 'a t
val get : 'a t -> int array -> float
val set : rw t -> int array -> float -> unit
val dstime : 'a t -> Time.t

val find_recent : unit -> ro t
