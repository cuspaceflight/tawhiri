open Core.Std

type t

val filename : Time.t -> string
val shape : int * int * int * int * int
val shape_arr : int array

val create : Time.t -> t
val get : t -> int array -> float
val dstime : t -> Time.t

val find_recent : unit -> t

val iter : f:(int -> int -> int -> int -> int -> float -> unit) -> t -> unit
