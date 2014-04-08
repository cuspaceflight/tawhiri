open Core.Std

type t

val filename : Time.t -> string
val shape : int * int * int * int * int
val topleft : int * int * int * int * int
val shape_arr : int array
val topleft_arr : int array

val create : Time.t -> t
val get : t -> int array -> float
val set : t -> int array -> float -> unit
val dstime : t -> Time.t

val copy_from_dataset : t -> 'a Dataset.t -> unit
val copy_to_dataset : t -> Dataset.rw Dataset.t -> unit
